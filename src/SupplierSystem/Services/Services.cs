using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using SupplierSystem.Data;
using SupplierSystem.Models;

namespace SupplierSystem.Services;

/// <summary>المستخدم الحالي (محاكاة RBAC عبر الترويسات X-User / X-Role إلى حين ربط نظام هوية).</summary>
public record CurrentUser(string Name, string Role, string EmployeeNo = "")
{
    public static CurrentUser From(HttpContext ctx)
    {
        var name = Uri.UnescapeDataString(ctx.Request.Headers["X-User"].FirstOrDefault() ?? "مستخدم النظام");
        var role = ctx.Request.Headers["X-Role"].FirstOrDefault() ?? "Procurement";
        if (!Catalog.Roles.Contains(role)) role = "Procurement";
        return new CurrentUser(name, role, ctx.Request.Headers["X-Emp"].FirstOrDefault() ?? "");
    }
    public bool Is(params string[] roles) => Role == "Admin" || roles.Contains(Role);
}

public class AuditService(AppDbContext db)
{
    private string? _lastHash; // يضمن تسلسل السجلات المضافة ضمن نفس الطلب قبل الحفظ

    public async Task LogAsync(CurrentUser user, string action, string entity, int? entityId, string details)
    {
        var prev = _lastHash ?? await db.AuditLogs.OrderByDescending(a => a.Id).Select(a => a.Hash).FirstOrDefaultAsync() ?? new string('0', 64);
        var log = new AuditLog
        {
            Timestamp = DateTime.UtcNow, User = user.Name, Role = user.Role,
            Action = action, Entity = entity, EntityId = entityId, Details = details, PrevHash = prev
        };
        log.Hash = ComputeHash(log);
        _lastHash = log.Hash;
        db.AuditLogs.Add(log);
    }

    public static string ComputeHash(AuditLog l)
    {
        var raw = $"{l.PrevHash}|{l.Timestamp:O}|{l.User}|{l.Role}|{l.Action}|{l.Entity}|{l.EntityId}|{l.Details}";
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(raw))).ToLowerInvariant();
    }

    /// <summary>يتحقق من سلامة السلسلة ويعيد أول سجل تم العبث به إن وجد.</summary>
    public async Task<(bool ok, long? brokenAt, int count)> VerifyAsync()
    {
        var prev = new string('0', 64);
        var count = 0;
        await foreach (var l in db.AuditLogs.AsNoTracking().OrderBy(a => a.Id).AsAsyncEnumerable())
        {
            count++;
            // التواريخ تعود من SQLite بنوع Unspecified؛ نعيدها UTC لتطابق الصيغة الأصلية.
            l.Timestamp = DateTime.SpecifyKind(l.Timestamp, DateTimeKind.Utc);
            if (l.PrevHash != prev || ComputeHash(l) != l.Hash) return (false, l.Id, count);
            prev = l.Hash;
        }
        return (true, null, count);
    }
}

public class ClassificationService(AppDbContext db)
{
    public async Task<SystemSettings> GetSettingsAsync() =>
        await db.Settings.FirstOrDefaultAsync() ?? new SystemSettings();

    public static CapitalTier Classify(decimal capital, SystemSettings s) =>
        capital >= s.TierAMin ? CapitalTier.A : capital >= s.TierBMin ? CapitalTier.B : capital >= s.TierCMin ? CapitalTier.C : CapitalTier.U;

    public static string TierAr(CapitalTier t) => t switch
    {
        CapitalTier.A => "فئة (أ)", CapitalTier.B => "فئة (ب)", CapitalTier.C => "فئة (ج)", _ => "غير مصنف"
    };
}

/// <summary>تجزئة كلمات المرور (PBKDF2-SHA256).</summary>
public static class Passwords
{
    public static string Hash(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(16);
        var key = Rfc2898DeriveBytes.Pbkdf2(password, salt, 100_000, HashAlgorithmName.SHA256, 32);
        return $"{Convert.ToBase64String(salt)}.{Convert.ToBase64String(key)}";
    }

    public static bool Verify(string password, string stored)
    {
        var parts = stored.Split('.');
        if (parts.Length != 2) return false;
        var salt = Convert.FromBase64String(parts[0]);
        var key = Rfc2898DeriveBytes.Pbkdf2(password, salt, 100_000, HashAlgorithmName.SHA256, 32);
        return CryptographicOperations.FixedTimeEquals(key, Convert.FromBase64String(parts[1]));
    }

    /// <summary>كلمة مرور مؤقتة مقروءة (بدون الأحرف المتشابهة) يغيّرها المستخدم عند أول دخول.</summary>
    public static string Temporary()
    {
        const string chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
        return "Tmp-" + new string(Enumerable.Range(0, 6).Select(_ => chars[RandomNumberGenerator.GetInt32(chars.Length)]).ToArray());
    }

    /// <summary>سياسة كلمة المرور: 8 أحرف على الأقل، وتحتوي حرفاً ورقماً.</summary>
    public static string? PolicyError(string? p) =>
        string.IsNullOrEmpty(p) || p.Length < 8 || !p.Any(char.IsLetter) || !p.Any(char.IsDigit)
            ? "كلمة المرور يجب أن تكون 8 أحرف على الأقل وتحتوي حرفاً ورقماً" : null;
}

public record Check(string Code, string Title, bool Passed, string Message);

public record CandidateResult(
    int SupplierId, string Code, string Name, string City, string MainActivity, string Tier,
    decimal Capital, decimal MaxTenderValue, decimal Utilization, bool Eligible, int Score,
    string Status, DateOnly? CommercialRegExpiry, DateOnly? PracticeLicenseExpiry, List<Check> Checks);

public record EligibilityQuery(decimal Value, string? Activity, DateOnly? ReferenceDate, bool IncludeSubActivities = true);

public record EligibilitySummary(
    decimal Value, string? Activity, DateOnly ReferenceDate, decimal Ratio, decimal RequiredMinCapital,
    string RequiredTier, int Total, int EligibleCount, int ExcludedCount,
    Dictionary<string, int> ExclusionReasons, List<CandidateResult> Candidates, long ElapsedMs);

/// <summary>محرك الترشيح للمناقصات (FR-03 / BR-01..04).</summary>
public class EligibilityEngine(AppDbContext db, ClassificationService cls)
{
    public async Task<EligibilitySummary> EvaluateAsync(EligibilityQuery q)
    {
        var sw = System.Diagnostics.Stopwatch.StartNew();
        var s = await cls.GetSettingsAsync();
        var refDate = q.ReferenceDate ?? DateOnly.FromDateTime(DateTime.Today);
        var requiredCapital = s.MaxTenderToCapitalRatio > 0 ? Math.Round(q.Value / s.MaxTenderToCapitalRatio, 2) : q.Value;

        var suppliers = await db.Suppliers.AsNoTracking().ToListAsync();
        var results = new List<CandidateResult>();

        foreach (var x in suppliers)
        {
            // نستبعد مسبقاً الموردين خارج النشاط تماماً حتى لا تزدحم القائمة؛ ويظهرون فقط عند عدم تحديد النشاط.
            var activityMatch = string.IsNullOrWhiteSpace(q.Activity)
                || x.MainActivity == q.Activity
                || (q.IncludeSubActivities && (x.SubActivities ?? "").Split(';', StringSplitOptions.TrimEntries).Contains(q.Activity));
            if (!activityMatch) continue;

            var checks = new List<Check>();
            var missing = MissingCoreData(x);
            checks.Add(new("BR-01", "اكتمال البيانات والوثائق", missing.Count == 0,
                missing.Count == 0 ? "البيانات الأساسية مكتملة" : "ناقص: " + string.Join("، ", missing)));

            var approved = x.FinancialApproval == ApprovalState.Approved && x.LegalApproval == ApprovalState.Approved
                           && x.ActivationApproval == ApprovalState.Approved && x.Status == SupplierStatus.Qualified;
            checks.Add(new("BR-02", "الاعتماد والتفعيل", approved,
                approved ? "معتمد مالياً وقانونياً ومُفعّل من إدارة الفرع" : $"الحالة: {StatusAr(x.Status)} · مالي: {ApprovalAr(x.FinancialApproval)} · قانوني: {ApprovalAr(x.LegalApproval)} · التفعيل: {ApprovalAr(x.ActivationApproval)}"));

            var crOk = x.CommercialRegExpiryDate is { } cr && cr >= refDate;
            checks.Add(new("LEG-1", "سريان السجل التجاري", crOk,
                crOk ? $"ساري حتى {x.CommercialRegExpiryDate:yyyy-MM-dd}" : x.CommercialRegExpiryDate is null ? "تاريخ الانتهاء غير مدخل" : $"منتهي منذ {x.CommercialRegExpiryDate:yyyy-MM-dd}"));

            var licOk = x.PracticeLicenseExpiryDate is { } pl && pl >= refDate;
            checks.Add(new("LEG-2", "سريان إذن مزاولة النشاط", licOk,
                licOk ? $"ساري حتى {x.PracticeLicenseExpiryDate:yyyy-MM-dd}" : x.PracticeLicenseExpiryDate is null ? "غير مدخل" : $"منتهي منذ {x.PracticeLicenseExpiryDate:yyyy-MM-dd}"));

            var tier = ClassificationService.Classify(x.Capital, s);
            var tierOk = tier != CapitalTier.U;
            checks.Add(new("BR-03", "التصنيف حسب رأس المال", tierOk,
                tierOk ? $"{ClassificationService.TierAr(tier)} برأس مال {x.Capital:N0} د.ل"
                       : $"رأس المال {x.Capital:N0} د.ل أقل من الحد الأدنى للتصنيف {s.TierCMin:N0} د.ل"));

            var maxValue = Math.Round(x.Capital * s.MaxTenderToCapitalRatio, 2);
            var capOk = q.Value <= maxValue;
            var util = x.Capital > 0 ? Math.Round(q.Value / x.Capital * 100m, 1) : 999m;
            checks.Add(new("BR-04", "الملاءمة المالية مقابل قيمة المناقصة", capOk,
                capOk ? $"القيمة تمثل {util}% من رأس المال (الحد {s.MaxTenderToCapitalRatio * 100:0}%)"
                      : $"القيمة تمثل {util}% من رأس المال وتتجاوز الحد {s.MaxTenderToCapitalRatio * 100:0}% — العجز {(q.Value - maxValue):N0} د.ل"));

            if (!string.IsNullOrWhiteSpace(q.Activity))
            {
                var main = x.MainActivity == q.Activity;
                checks.Add(new("ACT", "مطابقة النشاط", true, main ? "النشاط الرئيسي مطابق" : "مطابق عبر نشاط فرعي"));
            }

            var eligible = checks.All(c => c.Passed);
            results.Add(new CandidateResult(
                x.Id, x.Code, x.NameAr, x.City, x.MainActivity, ClassificationService.Classify(x.Capital, s).ToString(),
                x.Capital, maxValue, util, eligible, Score(x, q, util, refDate, eligible), x.Status.ToString(),
                x.CommercialRegExpiryDate, x.PracticeLicenseExpiryDate, checks));
        }

        var ordered = results
            .OrderByDescending(r => r.Eligible)
            .ThenByDescending(r => r.Score)
            .ThenByDescending(r => r.Capital)
            .ToList();

        var reasons = ordered.Where(r => !r.Eligible)
            .SelectMany(r => r.Checks.Where(c => !c.Passed).Select(c => c.Title))
            .GroupBy(t => t).ToDictionary(g => g.Key, g => g.Count());

        sw.Stop();
        return new EligibilitySummary(q.Value, q.Activity, refDate, s.MaxTenderToCapitalRatio, requiredCapital,
            RequiredTierOf(requiredCapital, s), ordered.Count,
            ordered.Count(r => r.Eligible), ordered.Count(r => !r.Eligible), reasons, ordered, sw.ElapsedMilliseconds);
    }

    /// <summary>أدنى فئة تكفي لقيمة المناقصة؛ ولا تقل عن فئة (ج).</summary>
    private static string RequiredTierOf(decimal requiredCapital, SystemSettings s)
    {
        var t = ClassificationService.Classify(requiredCapital, s);
        return (t == CapitalTier.U ? CapitalTier.C : t).ToString();
    }

    /// <summary>درجة ترتيب (0-100): هامش الملاءمة المالية + مدة سريان الوثائق + اكتمال الوثائق + مطابقة النشاط الرئيسي.</summary>
    private static int Score(Supplier x, EligibilityQuery q, decimal util, DateOnly refDate, bool eligible)
    {
        double score = 0;
        score += Math.Clamp(50 - (double)util, 0, 50) * 0.8;                    // حتى 40: كلما قلّ الاستخدام زادت الملاءمة المالية
        var days = new[] { x.CommercialRegExpiryDate, x.PracticeLicenseExpiryDate }
            .Select(d => d is null ? 0 : d.Value.DayNumber - refDate.DayNumber).Min();
        score += Math.Clamp(days / 365.0 * 25, 0, 25);                          // حتى 25: سريان الوثائق
        score += x.PaidUpCapital is > 0 && x.Capital > 0 ? Math.Min(15, (double)(x.PaidUpCapital.Value / x.Capital) * 15) : 0; // حتى 15
        score += x.MainActivity == q.Activity || string.IsNullOrEmpty(q.Activity) ? 20 : 10; // حتى 20
        if (!eligible) score *= 0.5;
        return (int)Math.Round(Math.Clamp(score, 0, 100));
    }

    public static List<string> MissingCoreData(Supplier x)
    {
        var m = new List<string>();
        if (string.IsNullOrWhiteSpace(x.CommercialRegNo)) m.Add("السجل التجاري");
        if (string.IsNullOrWhiteSpace(x.PracticeLicenseNo)) m.Add("مزاولة النشاط");
        if (string.IsNullOrWhiteSpace(x.RealEstateRegNo)) m.Add("السجل العقاري");
        if (x.Capital <= 0) m.Add("رأس المال");
        if (string.IsNullOrWhiteSpace(x.MainActivity)) m.Add("النشاط");
        return m;
    }

    public static string StatusAr(SupplierStatus s) => s switch
    {
        SupplierStatus.PendingVerification => "قيد المراجعة",
        SupplierStatus.Qualified => "نشط ومؤهل",
        SupplierStatus.Returned => "مُرجع للتصحيح",
        SupplierStatus.Suspended => "موقوف",
        SupplierStatus.Rejected => "مرفوض",
        _ => s.ToString()
    };

    public static string ApprovalAr(ApprovalState s) => s switch
    {
        ApprovalState.Approved => "معتمد", ApprovalState.Returned => "مُرجع", _ => "بانتظار"
    };
}
