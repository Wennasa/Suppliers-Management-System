using System.Text;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SupplierSystem.Data;
using SupplierSystem.Models;
using SupplierSystem.Services;

namespace SupplierSystem.Endpoints;

public static class Api
{
    private static readonly string[] AllowedExt = { ".pdf", ".jpg", ".jpeg", ".png" };
    private const long MaxFileBytes = 10 * 1024 * 1024;

    public static void MapApi(this WebApplication app)
    {
        var api = app.MapGroup("/api");

        // ===================== بيانات مرجعية =====================
        api.MapGet("/meta", async (ClassificationService cls) => new
        {
            activities = Catalog.Activities, legalForms = Catalog.LegalForms, cities = Catalog.Cities,
            roles = Catalog.Roles, settings = await cls.GetSettingsAsync(),
            documentTypes = Enum.GetNames<DocumentType>(),
            documentCatalog = Catalog.Documents.Select(d => new { type = d.Type.ToString(), name = d.NameAr, group = d.Group, required = d.Required, stage = d.Stage, hint = d.Hint })
        });

        // ===================== تسجيل الدخول =====================
        api.MapGet("/auth/demo-users", () => SeedData.DemoUsers.Select(u => new { employeeNo = u.No, email = u.Email, fullName = u.Name, role = u.Role }));
        api.MapPost("/auth/login", async (LoginInput input, AppDbContext db, AuditService audit) =>
        {
            var id = (input.Identifier ?? "").Trim();
            if (id.Length == 0 || string.IsNullOrEmpty(input.Password))
                return Problem("أدخل البريد الإلكتروني أو الرقم الوظيفي وكلمة المرور");
            var lower = id.ToLowerInvariant();
            var u = await db.Users.FirstOrDefaultAsync(x => x.Email.ToLower() == lower || x.EmployeeNo == id);
            if (u is null || !Passwords.Verify(input.Password, u.PasswordHash))
                return Results.Json(new { title = "بيانات الدخول غير صحيحة. تحقق من البريد أو الرقم الوظيفي وكلمة المرور." }, statusCode: 401);
            if (!u.IsActive) return Results.Json(new { title = "هذا الحساب موقوف. تواصل مع مدير النظام." }, statusCode: 403);
            u.LastLoginAt = DateTime.UtcNow;
            await audit.LogAsync(new CurrentUser(u.FullName, u.Role), "Login", "User", u.Id,
                $"تسجيل دخول {u.FullName} (الرقم الوظيفي {u.EmployeeNo}) {(id.Contains('@') ? "بالبريد الإلكتروني" : "بالرقم الوظيفي")}");
            await db.SaveChangesAsync();
            return Results.Ok(new { employeeNo = u.EmployeeNo, email = u.Email, fullName = u.FullName, role = u.Role, mustChangePassword = u.MustChangePassword });
        });

        api.MapPost("/auth/change-password", async (ChangePasswordInput input, AppDbContext db, AuditService audit) =>
        {
            var u = await db.Users.FirstOrDefaultAsync(x => x.EmployeeNo == (input.EmployeeNo ?? ""));
            if (u is null || !u.IsActive || !Passwords.Verify(input.CurrentPassword ?? "", u.PasswordHash))
                return Problem("كلمة المرور الحالية غير صحيحة");
            if (Passwords.PolicyError(input.NewPassword) is { } err) return Problem(err);
            if (input.NewPassword == input.CurrentPassword) return Problem("اختر كلمة مرور مختلفة عن الحالية");
            u.PasswordHash = Passwords.Hash(input.NewPassword!);
            u.MustChangePassword = false;
            await audit.LogAsync(new CurrentUser(u.FullName, u.Role, u.EmployeeNo), "ChangePassword", "User", u.Id, $"تغيير كلمة المرور للمستخدم {u.FullName} ({u.EmployeeNo})");
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true });
        });

        // ===================== إدارة المستخدمين (مدير النظام) =====================
        static object UserDto(AppUser u) => new { id = u.Id, employeeNo = u.EmployeeNo, email = u.Email, fullName = u.FullName, role = u.Role, isActive = u.IsActive, mustChangePassword = u.MustChangePassword, createdAt = u.CreatedAt, lastLoginAt = u.LastLoginAt };

        static Dictionary<string, string[]> ValidateUser(UserInput i)
        {
            var e = new Dictionary<string, string[]>();
            if (string.IsNullOrWhiteSpace(i.FullName) || i.FullName.Trim().Length < 3) e["FullName"] = new[] { "الاسم مطلوب (3 أحرف على الأقل)" };
            if (string.IsNullOrWhiteSpace(i.EmployeeNo) || !i.EmployeeNo.Trim().All(char.IsDigit) || i.EmployeeNo.Trim().Length is < 3 or > 10) e["EmployeeNo"] = new[] { "الرقم الوظيفي أرقام فقط (من 3 إلى 10 خانات)" };
            if (string.IsNullOrWhiteSpace(i.Email) || !System.Text.RegularExpressions.Regex.IsMatch(i.Email.Trim(), @"^[^\s@]+@[^\s@]+\.[^\s@]+$")) e["Email"] = new[] { "البريد الإلكتروني غير صحيح" };
            if (!Catalog.Roles.Contains(i.Role)) e["Role"] = new[] { "اختر الدور" };
            return e;
        }

        api.MapGet("/users", async (HttpContext ctx, AppDbContext db) =>
        {
            if (CurrentUser.From(ctx).Role != "Admin") return Forbid("إدارة المستخدمين من صلاحية مدير النظام");
            return Results.Ok((await db.Users.AsNoTracking().OrderBy(u => u.EmployeeNo).ToListAsync()).Select(UserDto));
        });

        api.MapPost("/users", async (UserInput input, HttpContext ctx, AppDbContext db, AuditService audit) =>
        {
            var me = CurrentUser.From(ctx);
            if (me.Role != "Admin") return Forbid("إدارة المستخدمين من صلاحية مدير النظام");
            var errors = ValidateUser(input);
            var emp = input.EmployeeNo?.Trim() ?? ""; var email = input.Email?.Trim().ToLowerInvariant() ?? "";
            if (await db.Users.AnyAsync(u => u.EmployeeNo == emp)) errors["EmployeeNo"] = new[] { "الرقم الوظيفي مستخدم لموظف آخر" };
            if (await db.Users.AnyAsync(u => u.Email.ToLower() == email)) errors["Email"] = new[] { "البريد مستخدم لموظف آخر" };
            if (errors.Count > 0) return Results.ValidationProblem(errors);
            var temp = Passwords.Temporary();
            var u = new AppUser { EmployeeNo = emp, Email = email, FullName = input.FullName!.Trim(), Role = input.Role!, IsActive = input.IsActive, PasswordHash = Passwords.Hash(temp), MustChangePassword = true };
            db.Users.Add(u);
            await db.SaveChangesAsync();
            await audit.LogAsync(me, "CreateUser", "User", u.Id, $"إضافة المستخدم {u.FullName} ({u.EmployeeNo}) بدور {u.Role}");
            await db.SaveChangesAsync();
            return Results.Ok(new { user = UserDto(u), temporaryPassword = temp });
        });

        api.MapPut("/users/{id:int}", async (int id, UserInput input, HttpContext ctx, AppDbContext db, AuditService audit) =>
        {
            var me = CurrentUser.From(ctx);
            if (me.Role != "Admin") return Forbid("إدارة المستخدمين من صلاحية مدير النظام");
            var u = await db.Users.FindAsync(id);
            if (u is null) return Results.NotFound();
            var errors = ValidateUser(input);
            var emp = input.EmployeeNo?.Trim() ?? ""; var email = input.Email?.Trim().ToLowerInvariant() ?? "";
            if (await db.Users.AnyAsync(x => x.Id != id && x.EmployeeNo == emp)) errors["EmployeeNo"] = new[] { "الرقم الوظيفي مستخدم لموظف آخر" };
            if (await db.Users.AnyAsync(x => x.Id != id && x.Email.ToLower() == email)) errors["Email"] = new[] { "البريد مستخدم لموظف آخر" };
            if (errors.Count > 0) return Results.ValidationProblem(errors);
            if (u.EmployeeNo == me.EmployeeNo && (!input.IsActive || input.Role != "Admin"))
                return Problem("لا يمكنك إيقاف حسابك أو إزالة صلاحية مدير النظام عن نفسك");
            if (u.Role == "Admin" && u.IsActive && (!input.IsActive || input.Role != "Admin") && await db.Users.CountAsync(x => x.Role == "Admin" && x.IsActive) <= 1)
                return Problem("يجب أن يبقى مدير نظام واحد نشط على الأقل");
            var changes = new List<string>();
            if (u.FullName != input.FullName!.Trim()) changes.Add($"الاسم: {u.FullName} ← {input.FullName.Trim()}");
            if (u.EmployeeNo != emp) changes.Add($"الرقم الوظيفي: {u.EmployeeNo} ← {emp}");
            if (u.Email != email) changes.Add($"البريد: {u.Email} ← {email}");
            if (u.Role != input.Role) changes.Add($"الدور: {u.Role} ← {input.Role}");
            if (u.IsActive != input.IsActive) changes.Add(input.IsActive ? "تفعيل الحساب" : "إيقاف الحساب");
            u.FullName = input.FullName.Trim(); u.EmployeeNo = emp; u.Email = email; u.Role = input.Role!; u.IsActive = input.IsActive;
            if (changes.Count > 0) await audit.LogAsync(me, "UpdateUser", "User", u.Id, $"تعديل المستخدم {u.FullName}: {string.Join("، ", changes)}");
            await db.SaveChangesAsync();
            return Results.Ok(UserDto(u));
        });

        api.MapPost("/users/{id:int}/reset-password", async (int id, HttpContext ctx, AppDbContext db, AuditService audit) =>
        {
            var me = CurrentUser.From(ctx);
            if (me.Role != "Admin") return Forbid("إدارة المستخدمين من صلاحية مدير النظام");
            var u = await db.Users.FindAsync(id);
            if (u is null) return Results.NotFound();
            var temp = Passwords.Temporary();
            u.PasswordHash = Passwords.Hash(temp); u.MustChangePassword = true;
            await audit.LogAsync(me, "ResetPassword", "User", u.Id, $"إعادة تعيين كلمة المرور للمستخدم {u.FullName} ({u.EmployeeNo})");
            await db.SaveChangesAsync();
            return Results.Ok(new { temporaryPassword = temp });
        });

        // ===================== الموردون =====================
        api.MapGet("/suppliers", async (AppDbContext db, ClassificationService cls,
            string? q, string? activity, string? status, string? tier, string? city) =>
        {
            var s = await cls.GetSettingsAsync();
            var query = db.Suppliers.AsNoTracking().AsQueryable();
            if (!string.IsNullOrWhiteSpace(q))
                query = query.Where(x => x.NameAr.Contains(q) || (x.NameEn != null && x.NameEn.Contains(q)) || x.Code.Contains(q) || x.CommercialRegNo.Contains(q));
            if (!string.IsNullOrWhiteSpace(activity))
                query = query.Where(x => x.MainActivity == activity || (x.SubActivities != null && x.SubActivities.Contains(activity)));
            if (Enum.TryParse<SupplierStatus>(status, out var st)) query = query.Where(x => x.Status == st);
            if (!string.IsNullOrWhiteSpace(city)) query = query.Where(x => x.City == city);

            var list = (await query.ToListAsync()).Select(x => Summary(x, s));
            if (!string.IsNullOrWhiteSpace(tier)) list = list.Where(x => x.tier == tier);
            return list.OrderBy(x => x.code);
        });

        api.MapGet("/suppliers/{id:int}", async (int id, AppDbContext db, ClassificationService cls) =>
        {
            var x = await db.Suppliers.AsNoTracking().Include(d => d.Documents).FirstOrDefaultAsync(d => d.Id == id);
            if (x is null) return Results.NotFound();
            var s = await cls.GetSettingsAsync();
            return Results.Ok(new
            {
                supplier = x,
                tier = ClassificationService.Classify(x.Capital, s).ToString(),
                maxTenderValue = x.Capital * s.MaxTenderToCapitalRatio,
                missing = EligibilityEngine.MissingCoreData(x),
                missingDocuments = Catalog.CoreDocuments.Where(t => x.Documents.All(d => d.Type != t)).Select(t => t.ToString()),
                alerts = Alerts(x, s),
                subActivities = Split(x.SubActivities)
            });
        });

        api.MapPost("/suppliers", async (SupplierInput input, HttpContext ctx, AppDbContext db, AuditService audit) =>
        {
            var user = CurrentUser.From(ctx);
            if (!user.Is("Procurement")) return Forbid("إضافة الموردين من صلاحية مسؤول المشتريات");
            var errors = input.Validate();
            if (await db.Suppliers.AnyAsync(x => x.CommercialRegNo == input.CommercialRegNo.Trim()))
                errors["CommercialRegNo"] = new[] { "رقم السجل التجاري مسجل لمورد آخر" };
            if (errors.Count > 0) return Results.ValidationProblem(errors, title: "يرجى تصحيح الحقول المحددة");

            var s = new Supplier();
            input.ApplyTo(s);
            var last = await db.Suppliers.OrderByDescending(x => x.Id).Select(x => x.Code).FirstOrDefaultAsync();
            var next = int.TryParse(last?.Replace("SUP-", ""), out var n) ? n + 1 : 1;
            s.Code = $"SUP-{next:0000}";
            s.Status = SupplierStatus.PendingVerification; // BR-02: التسجيل آلي، التفعيل مشروط بالاعتماد
            db.Suppliers.Add(s);
            await db.SaveChangesAsync();
            await audit.LogAsync(user, "Create", "Supplier", s.Id, $"تسجيل المورد {s.Code} - {s.NameAr} بحالة قيد المراجعة");
            await db.SaveChangesAsync();
            return Results.Created($"/api/suppliers/{s.Id}", new { s.Id, s.Code });
        });

        api.MapPut("/suppliers/{id:int}", async (int id, SupplierInput input, HttpContext ctx, AppDbContext db, AuditService audit) =>
        {
            var user = CurrentUser.From(ctx);
            if (!user.Is("Procurement")) return Forbid("تعديل بيانات الموردين من صلاحية مسؤول المشتريات");
            var s = await db.Suppliers.FindAsync(id);
            if (s is null) return Results.NotFound();
            var errors = input.Validate();
            if (await db.Suppliers.AnyAsync(x => x.Id != id && x.CommercialRegNo == input.CommercialRegNo.Trim()))
                errors["CommercialRegNo"] = new[] { "رقم السجل التجاري مسجل لمورد آخر" };
            if (errors.Count > 0) return Results.ValidationProblem(errors, title: "يرجى تصحيح الحقول المحددة");

            var before = Snapshot(s);
            input.ApplyTo(s);
            var after = Snapshot(s);
            var changes = before.Where(kv => after[kv.Key] != kv.Value).Select(kv => kv.Key).ToList();
            if (changes.Count == 0) return Results.Ok(new { s.Id, changed = 0 });

            // أي تعديل على البيانات المالية أو القانونية يعيد الاعتماد المعني إلى "بانتظار" (حوكمة).
            var finFields = new[] { "Capital", "PaidUpCapital", "BankName", "BankAccount" };
            var legFields = new[] { "CommercialRegNo", "CommercialRegExpiryDate", "PracticeLicenseNo", "PracticeLicenseExpiryDate",
                                    "RealEstateRegNo", "IncorporationContractNo", "Partners", "MainActivity", "LegalForm" };
            var finReset = changes.Intersect(finFields).Any() || s.FinancialApproval == ApprovalState.Returned;
            var legReset = changes.Intersect(legFields).Any() || s.LegalApproval == ApprovalState.Returned;
            if (finReset) { s.FinancialApproval = ApprovalState.Pending; s.FinancialApprovedBy = null; s.FinancialApprovedAt = null; }
            if (legReset) { s.LegalApproval = ApprovalState.Pending; s.LegalApprovedBy = null; s.LegalApprovedAt = null; }
            // أي تعديل يُعيد اعتماد التفعيل إلى «بانتظار» حتى تعتمده إدارة الفرع من جديد
            s.ActivationApproval = ApprovalState.Pending; s.ActivationApprovedBy = null; s.ActivationApprovedAt = null;
            Recompute(s);
            s.UpdatedAt = DateTime.UtcNow;
            await audit.LogAsync(user, "Update", "Supplier", s.Id,
                $"تعديل {s.Code}: " + string.Join("، ", changes.Select(c => $"{c} [{before[c]} ← {after[c]}]")));
            await db.SaveChangesAsync();
            return Results.Ok(new { s.Id, changed = changes.Count, status = s.Status });
        });

        // سير عمل متسلسل في صفحة واحدة: المراجعة المالية ← المراجعة القانونية ← اعتماد التفعيل (إدارة الفرع)
        api.MapPost("/suppliers/{id:int}/review", async (int id, ReviewInput r, HttpContext ctx, AppDbContext db, AuditService audit) =>
        {
            var user = CurrentUser.From(ctx);
            var s = await db.Suppliers.Include(x => x.Documents).FirstOrDefaultAsync(x => x.Id == id);
            if (s is null) return Results.NotFound();
            if (s.Status is SupplierStatus.Suspended or SupplierStatus.Rejected)
                return Problem("المورد موقوف أو مرفوض؛ أعد تفعيله أولاً");
            var approve = r.Decision == "approve";
            if (!approve && string.IsNullOrWhiteSpace(r.Notes)) return Problem("سبب الإرجاع مطلوب");
            var state = approve ? ApprovalState.Approved : ApprovalState.Returned;
            string stage;

            switch (r.Track)
            {
                case "financial":
                    if (!user.Is("Finance")) return Forbid("المراجعة المالية من صلاحية المراجع المالي");
                    if (approve && MissingDocs(s, Catalog.StageDocuments("financial")) is { Count: > 0 } finDocs)
                        return Problem("لا يمكن الاعتماد المالي قبل إرفاق: " + string.Join("، ", finDocs.Select(DocAr)));
                    s.FinancialApproval = state; s.FinancialApprovedBy = user.Name; s.FinancialApprovedAt = DateTime.UtcNow; s.FinancialNotes = r.Notes;
                    stage = "المراجعة المالية"; break;
                case "legal":
                    if (!user.Is("Legal")) return Forbid("المراجعة القانونية من صلاحية المستشار القانوني");
                    if (s.FinancialApproval != ApprovalState.Approved) return Problem("يجب اعتماد المراجعة المالية أولاً");
                    if (approve && EligibilityEngine.MissingCoreData(s) is { Count: > 0 } miss)
                        return Problem("لا يمكن الاعتماد قبل استكمال: " + string.Join("، ", miss));
                    if (approve && MissingDocs(s, Catalog.StageDocuments("legal")) is { Count: > 0 } legDocs)
                        return Problem("لا يمكن الاعتماد القانوني قبل إرفاق: " + string.Join("، ", legDocs.Select(DocAr)));
                    s.LegalApproval = state; s.LegalApprovedBy = user.Name; s.LegalApprovedAt = DateTime.UtcNow; s.LegalNotes = r.Notes;
                    stage = "المراجعة القانونية"; break;
                case "activation":
                    if (!user.Is("Management")) return Forbid("اعتماد التفعيل من صلاحية إدارة الفرع");
                    if (s.FinancialApproval != ApprovalState.Approved || s.LegalApproval != ApprovalState.Approved)
                        return Problem("يجب اكتمال المراجعتين المالية والقانونية قبل اعتماد التفعيل");
                    var missingDocs = Catalog.CoreDocuments.Where(t => s.Documents.All(d => d.Type != t)).ToList();
                    if (approve && missingDocs.Count > 0)
                        return Problem("لا يمكن التفعيل قبل إرفاق المستندات اللازمة: " + string.Join("، ", missingDocs.Select(DocAr)));
                    s.ActivationApproval = state; s.ActivationApprovedBy = user.Name; s.ActivationApprovedAt = DateTime.UtcNow; s.ActivationNotes = r.Notes;
                    stage = "اعتماد التفعيل"; break;
                default: return Results.BadRequest();
            }

            Recompute(s);
            s.UpdatedAt = DateTime.UtcNow;
            await audit.LogAsync(user, approve ? "Approve" : "Return", "Supplier", s.Id,
                $"{stage}: {(approve ? "اعتماد" : "إرجاع للتصحيح")} {s.Code}" +
                (string.IsNullOrWhiteSpace(r.Notes) ? "" : $" — {r.Notes}") + $" ← الحالة: {EligibilityEngine.StatusAr(s.Status)}");
            await db.SaveChangesAsync();
            return Results.Ok(new { status = s.Status, s.FinancialApproval, s.LegalApproval, s.ActivationApproval });
        });

        api.MapPost("/suppliers/{id:int}/status", async (int id, StatusInput r, HttpContext ctx, AppDbContext db, AuditService audit) =>
        {
            var user = CurrentUser.From(ctx);
            if (!user.Is("Legal", "Management")) return Forbid("إيقاف/رفض المورد من صلاحية الشؤون القانونية أو الإدارة");
            var s = await db.Suppliers.FindAsync(id);
            if (s is null) return Results.NotFound();
            if (r.Status is SupplierStatus.Suspended or SupplierStatus.Rejected && string.IsNullOrWhiteSpace(r.Reason))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["Reason"] = new[] { "السبب مطلوب" } });
            var old = s.Status;
            if (r.Status is SupplierStatus.Suspended or SupplierStatus.Rejected) s.Status = r.Status;
            else { s.Status = SupplierStatus.PendingVerification; Recompute(s); } // إعادة تفعيل: تُحتسب الحالة من الاعتمادات
            s.UpdatedAt = DateTime.UtcNow;
            await audit.LogAsync(user, "StatusChange", "Supplier", s.Id,
                $"{s.Code}: {EligibilityEngine.StatusAr(old)} ← {EligibilityEngine.StatusAr(s.Status)}" + (string.IsNullOrWhiteSpace(r.Reason) ? "" : $" — {r.Reason}"));
            await db.SaveChangesAsync();
            return Results.Ok(new { status = s.Status });
        });

        api.MapDelete("/suppliers/{id:int}", async (int id, HttpContext ctx, AppDbContext db, AuditService audit, IWebHostEnvironment env) =>
        {
            var user = CurrentUser.From(ctx);
            if (user.Role != "Admin") return Forbid("الحذف من صلاحية مدير النظام فقط");
            var s = await db.Suppliers.Include(x => x.Documents).FirstOrDefaultAsync(x => x.Id == id);
            if (s is null) return Results.NotFound();
            if (await db.TenderInvitations.AnyAsync(i => i.SupplierId == id))
                return Results.Conflict(new { title = "لا يمكن حذف مورد مدرج في قوائم دعوات سابقة — استخدم الإيقاف بدلاً من ذلك" });
            foreach (var d in s.Documents) File.Delete(Path.Combine(UploadDir(env), d.StoredName));
            db.Suppliers.Remove(s);
            await audit.LogAsync(user, "Delete", "Supplier", id, $"حذف المورد {s.Code} - {s.NameAr}");
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        api.MapGet("/suppliers/export.xlsx", async (AppDbContext db, ClassificationService cls) =>
        {
            var s = await cls.GetSettingsAsync();
            var rows = await db.Suppliers.AsNoTracking().OrderBy(x => x.Code).ToListAsync();
            var x = new XlsxWriter("الموردون", 12, 38, 24, 12, 26, 16, 8, 18, 14, 14, 14, 16)
                .Title("سجل الموردين").Info($"تاريخ التصدير: {DateTime.Now:yyyy-MM-dd HH:mm}", $"عدد الموردين: {rows.Count}").Blank()
                .Header("الرمز", "الاسم", "الشكل القانوني", "المدينة", "النشاط الرئيسي", "رأس المال (د.ل)", "الفئة", "السجل التجاري", "انتهاء السجل", "مزاولة النشاط", "انتهاء المزاولة", "الحالة");
            foreach (var r in rows)
                x.Row(r.Code, r.NameAr, r.LegalForm, r.City, r.MainActivity, r.Capital, ClassificationService.TierAr(ClassificationService.Classify(r.Capital, s)),
                      r.CommercialRegNo, r.CommercialRegExpiryDate, r.PracticeLicenseNo, r.PracticeLicenseExpiryDate, EligibilityEngine.StatusAr(r.Status));
            return Results.File(x.ToBytes(), XlsxWriter.ContentType, $"suppliers-{DateTime.Today:yyyyMMdd}.xlsx");
        });

        // ===================== الوثائق =====================
        api.MapPost("/suppliers/{id:int}/documents", async (int id, [FromForm] IFormFile file, [FromForm] DocumentType type,
            HttpContext ctx, AppDbContext db, AuditService audit, IWebHostEnvironment env) =>
        {
            var user = CurrentUser.From(ctx);
            if (!user.Is("Procurement", "Legal", "Finance")) return Forbid("لا تملك صلاحية رفع الوثائق");
            if (!await db.Suppliers.AnyAsync(x => x.Id == id)) return Results.NotFound();
            var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
            if (!AllowedExt.Contains(ext)) return Results.ValidationProblem(new Dictionary<string, string[]> { ["file"] = new[] { "الصيغ المسموحة: PDF, JPG, PNG" } });
            if (file.Length is 0 or > MaxFileBytes) return Results.ValidationProblem(new Dictionary<string, string[]> { ["file"] = new[] { "الحجم الأقصى 10 ميغابايت" } });

            var stored = $"{Guid.NewGuid():N}{ext}";
            await using (var fs = File.Create(Path.Combine(UploadDir(env), stored))) await file.CopyToAsync(fs);
            var doc = new SupplierDocument
            {
                SupplierId = id, Type = type, FileName = Path.GetFileName(file.FileName), StoredName = stored,
                ContentType = ext == ".pdf" ? "application/pdf" : ext == ".png" ? "image/png" : "image/jpeg",
                Size = file.Length, UploadedBy = user.Name
            };
            db.Documents.Add(doc);
            await audit.LogAsync(user, "Upload", "Supplier", id, $"رفع وثيقة ({type}): {doc.FileName}");
            await db.SaveChangesAsync();
            return Results.Ok(doc);
        }).DisableAntiforgery();

        api.MapGet("/documents/{id:int}", async (int id, AppDbContext db, IWebHostEnvironment env) =>
        {
            var d = await db.Documents.FindAsync(id);
            if (d is null) return Results.NotFound();
            var path = Path.Combine(UploadDir(env), d.StoredName);
            return File.Exists(path) ? Results.File(path, d.ContentType, d.FileName, enableRangeProcessing: true) : Results.NotFound();
        });

        api.MapDelete("/documents/{id:int}", async (int id, HttpContext ctx, AppDbContext db, AuditService audit, IWebHostEnvironment env) =>
        {
            var user = CurrentUser.From(ctx);
            if (!user.Is("Procurement")) return Forbid("لا تملك صلاحية حذف الوثائق");
            var d = await db.Documents.FindAsync(id);
            if (d is null) return Results.NotFound();
            File.Delete(Path.Combine(UploadDir(env), d.StoredName));
            db.Documents.Remove(d);
            await audit.LogAsync(user, "DeleteDocument", "Supplier", d.SupplierId, $"حذف وثيقة ({d.Type}): {d.FileName}");
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        // ===================== محرك الترشيح =====================
        api.MapPost("/eligibility", async (EligibilityQuery q, EligibilityEngine engine) =>
        {
            if (q.Value <= 0) return Results.ValidationProblem(new Dictionary<string, string[]> { ["Value"] = new[] { "أدخل قيمة مناقصة أكبر من صفر" } });
            return Results.Ok(await engine.EvaluateAsync(q));
        });

        api.MapGet("/eligibility/export.xlsx", async (decimal value, string? activity, DateOnly? date, bool? subs, EligibilityEngine engine) =>
        {
            if (value <= 0) return Problem("أدخل قيمة مناقصة أكبر من صفر");
            var d = await engine.EvaluateAsync(new EligibilityQuery(value, string.IsNullOrWhiteSpace(activity) ? null : activity, date, subs ?? true));
            var x = new XlsxWriter("نتيجة المطابقة", 6, 12, 38, 14, 24, 10, 18, 18, 12, 10, 12, 60)
                .Title("نتيجة مطابقة قيمة المناقصة")
                .Info($"قيمة المناقصة: {d.Value:N0} د.ل", $"النشاط: {d.Activity ?? "كل الأنشطة"}", $"حتى تاريخ: {d.ReferenceDate:yyyy-MM-dd}",
                      $"الحد الأدنى لرأس المال: {d.RequiredMinCapital:N0} د.ل", $"المؤهلون: {d.EligibleCount} من {d.Total}", $"تاريخ التصدير: {DateTime.Now:yyyy-MM-dd HH:mm}")
                .Blank()
                .Header("م", "الرمز", "المورد", "المدينة", "النشاط الرئيسي", "الفئة", "رأس المال (د.ل)", "أقصى قيمة مناقصة (د.ل)", "نسبة الاستخدام %", "الدرجة", "النتيجة", "أسباب الاستبعاد");
            var n = 0;
            foreach (var c in d.Candidates)
                x.Row(++n, c.Code, c.Name, c.City, c.MainActivity, c.Tier == "U" ? "غير مصنف" : c.Tier, c.Capital, c.MaxTenderValue, c.Utilization, c.Score,
                      c.Eligible ? "مؤهل" : "مستبعد", string.Join(" · ", c.Checks.Where(k => !k.Passed).Select(k => $"{k.Title}: {k.Message}")));
            return Results.File(x.ToBytes(), XlsxWriter.ContentType, $"eligibility-{DateTime.Today:yyyyMMdd}.xlsx");
        });

        // ===================== المناقصات =====================
        api.MapGet("/tenders", async (AppDbContext db) =>
            (await db.Tenders.AsNoTracking().Include(t => t.Invitations).ToListAsync())
                .OrderByDescending(t => t.CreatedAt)
                .Select(t => new { t.Id, t.RefNo, t.Title, t.Activity, t.Value, t.ClosingDate, t.CreatedAt, t.CreatedBy, invited = t.Invitations.Count }));

        api.MapGet("/tenders/{id:int}", async (int id, AppDbContext db) =>
        {
            var t = await db.Tenders.AsNoTracking().Include(x => x.Invitations).ThenInclude(i => i.Supplier).FirstOrDefaultAsync(x => x.Id == id);
            return t is null ? Results.NotFound() : Results.Ok(new
            {
                t.Id, t.RefNo, t.Title, t.Activity, t.Value, t.ClosingDate, t.Description, t.CreatedAt, t.CreatedBy,
                invitations = t.Invitations.Select(i => new
                {
                    i.SupplierId, i.CapitalUtilization, i.Supplier!.Code, i.Supplier.NameAr, i.Supplier.City,
                    i.Supplier.Capital, i.Supplier.Phone, i.Supplier.Email, i.Supplier.ContactPerson
                }).OrderBy(i => i.CapitalUtilization)
            });
        });

        api.MapPost("/tenders", async (TenderInput input, HttpContext ctx, AppDbContext db, EligibilityEngine engine, AuditService audit) =>
        {
            var user = CurrentUser.From(ctx);
            if (!user.Is("Procurement")) return Forbid("إنشاء المناقصات من صلاحية مسؤول المشتريات");
            var errors = new Dictionary<string, string[]>();
            if (string.IsNullOrWhiteSpace(input.Title)) errors["Title"] = new[] { "عنوان المناقصة مطلوب" };
            if (!Catalog.Activities.Contains(input.Activity)) errors["Activity"] = new[] { "اختر النشاط" };
            if (input.Value <= 0) errors["Value"] = new[] { "القيمة يجب أن تكون أكبر من صفر" };
            if (input.ClosingDate < DateOnly.FromDateTime(DateTime.Today)) errors["ClosingDate"] = new[] { "تاريخ الإقفال يجب أن يكون اليوم أو بعده" };
            if (errors.Count > 0) return Results.ValidationProblem(errors);

            // يُعاد تشغيل المحرك عند الحفظ: لا يمكن دعوة مورد غير مؤهل حتى لو أُرسل معرّفه.
            var result = await engine.EvaluateAsync(new EligibilityQuery(input.Value, input.Activity, input.ClosingDate));
            var eligible = result.Candidates.Where(c => c.Eligible).ToDictionary(c => c.SupplierId);
            var chosen = input.SupplierIds is { Count: > 0 } ids ? ids.Distinct().ToList() : eligible.Keys.ToList();
            var rejected = chosen.Where(id => !eligible.ContainsKey(id)).ToList();
            if (rejected.Count > 0) return Results.ValidationProblem(new Dictionary<string, string[]> { ["SupplierIds"] = new[] { $"{rejected.Count} من الموردين المختارين غير مؤهلين لهذه المناقصة" } });
            if (chosen.Count == 0) return Results.ValidationProblem(new Dictionary<string, string[]> { ["SupplierIds"] = new[] { "لا يوجد موردون مؤهلون لهذه المناقصة" } });

            var count = await db.Tenders.CountAsync();
            var t = new Tender
            {
                RefNo = $"TND-{DateTime.Today:yyyy}-{count + 1:000}", Title = input.Title.Trim(), Activity = input.Activity,
                Value = input.Value, ClosingDate = input.ClosingDate, Description = input.Description, CreatedBy = user.Name,
                Invitations = chosen.Select(id => new TenderInvitation { SupplierId = id, CapitalUtilization = eligible[id].Utilization }).ToList()
            };
            db.Tenders.Add(t);
            await db.SaveChangesAsync();
            await audit.LogAsync(user, "CreateTender", "Tender", t.Id,
                $"إنشاء المناقصة {t.RefNo} «{t.Title}» بقيمة {t.Value:N0} د.ل وإصدار قائمة دعوات لـ {chosen.Count} مورد (من أصل {eligible.Count} مؤهل)");
            await db.SaveChangesAsync();
            return Results.Created($"/api/tenders/{t.Id}", new { t.Id, t.RefNo });
        });

        // قائمة الدعوات لمناقصة واحدة (Excel)
        api.MapGet("/tenders/{id:int}/export.xlsx", async (int id, AppDbContext db) =>
        {
            var t = await db.Tenders.AsNoTracking().Include(x => x.Invitations).ThenInclude(i => i.Supplier).FirstOrDefaultAsync(x => x.Id == id);
            if (t is null) return Results.NotFound();
            var x = new XlsxWriter("قائمة الدعوات", 6, 12, 38, 12, 18, 14, 18, 16, 28)
                .Title($"قائمة الدعوات — {t.Title}")
                .Info("الرقم المرجعي", t.RefNo, "النشاط", t.Activity)
                .Info("القيمة التقديرية (د.ل)", t.Value, "تاريخ الإقفال", t.ClosingDate)
                .Info("أُصدرت بواسطة", t.CreatedBy, "بتاريخ", t.CreatedAt.ToLocalTime()).Blank()
                .Header("م", "الرمز", "اسم المورد", "المدينة", "رأس المال (د.ل)", "نسبة الاستخدام %", "مسؤول التواصل", "الهاتف", "البريد");
            var n = 1;
            foreach (var inv in t.Invitations.OrderBy(i => i.CapitalUtilization))
                x.Row(n++, inv.Supplier!.Code, inv.Supplier.NameAr, inv.Supplier.City, inv.Supplier.Capital, inv.CapitalUtilization,
                      inv.Supplier.ContactPerson, inv.Supplier.Phone, inv.Supplier.Email);
            x.Blank().Info("جميع الموردين المدرجين اجتازوا قواعد الأهلية BR-01 → BR-04 عند الإصدار.");
            return Results.File(x.ToBytes(), XlsxWriter.ContentType, $"{t.RefNo}-invitations.xlsx");
        });

        // سجل المناقصات (Excel)
        api.MapGet("/tenders/export.xlsx", async (AppDbContext db) =>
        {
            var list = (await db.Tenders.AsNoTracking().Include(t => t.Invitations).ToListAsync()).OrderByDescending(t => t.CreatedAt).ToList();
            var x = new XlsxWriter("المناقصات", 16, 40, 26, 18, 14, 12, 20, 18)
                .Title("سجل المناقصات وقوائم الدعوات").Info($"تاريخ التصدير: {DateTime.Now:yyyy-MM-dd HH:mm}", $"عدد المناقصات: {list.Count}").Blank()
                .Header("الرقم المرجعي", "العنوان", "النشاط", "القيمة التقديرية (د.ل)", "تاريخ الإقفال", "عدد المدعوين", "أنشئت بواسطة", "تاريخ الإنشاء");
            foreach (var t in list)
                x.Row(t.RefNo, t.Title, t.Activity, t.Value, t.ClosingDate, t.Invitations.Count, t.CreatedBy, t.CreatedAt.ToLocalTime());
            if (list.Count > 0) x.Blank().Row("الإجمالي", null, null, list.Sum(t => t.Value), null, list.Sum(t => t.Invitations.Count));
            return Results.File(x.ToBytes(), XlsxWriter.ContentType, $"tenders-{DateTime.Today:yyyyMMdd}.xlsx");
        });

        // ===================== لوحة المؤشرات =====================
        api.MapGet("/dashboard", async (AppDbContext db, ClassificationService cls) =>
        {
            var s = await cls.GetSettingsAsync();
            var all = await db.Suppliers.AsNoTracking().ToListAsync();
            var today = DateOnly.FromDateTime(DateTime.Today);
            var alerts = all.SelectMany(x => Alerts(x, s).Select(a => new { x.Id, x.Code, x.NameAr, a.type, a.label, a.date, a.days, a.severity }))
                            .OrderBy(a => a.days).ToList();
            var tenders = await db.Tenders.AsNoTracking().ToListAsync();
            return new
            {
                total = all.Count,
                qualified = all.Count(x => x.Status == SupplierStatus.Qualified),
                pending = all.Count(x => x.Status == SupplierStatus.PendingVerification),
                returned = all.Count(x => x.Status == SupplierStatus.Returned),
                suspended = all.Count(x => x.Status is SupplierStatus.Suspended or SupplierStatus.Rejected),
                completeness = all.Count == 0 ? 0 : Math.Round(all.Count(x => EligibilityEngine.MissingCoreData(x).Count == 0) * 100.0 / all.Count, 1),
                totalCapital = all.Sum(x => x.Capital),
                tiers = new[] { "A", "B", "C", "U" }.Select(t => new { tier = t, count = all.Count(x => ClassificationService.Classify(x.Capital, s).ToString() == t) }),
                byActivity = all.GroupBy(x => x.MainActivity).Select(g => new { activity = g.Key, count = g.Count(), qualified = g.Count(x => x.Status == SupplierStatus.Qualified) }).OrderByDescending(g => g.count),
                byStatus = all.GroupBy(x => x.Status).Select(g => new { status = g.Key.ToString(), count = g.Count() }),
                expired = alerts.Count(a => a.days < 0),
                expiringSoon = alerts.Count(a => a.days >= 0),
                alerts = alerts.Take(15),
                tenders = tenders.Count,
                tendersValue = tenders.Sum(t => t.Value),
                pendingReview = all.Where(x => x.Status is SupplierStatus.PendingVerification or SupplierStatus.Returned)
                                   .Select(x => new { x.Id, x.Code, x.NameAr, x.FinancialApproval, x.LegalApproval, x.ActivationApproval, x.Status }).Take(10),
                recent = await db.AuditLogs.AsNoTracking().OrderByDescending(a => a.Id).Take(8).ToListAsync()
            };
        });

        // ===================== سجل التدقيق =====================
        api.MapGet("/audit", async (AppDbContext db, string? entity, int? entityId, string? q, int take = 200) =>
        {
            var query = db.AuditLogs.AsNoTracking().AsQueryable();
            if (!string.IsNullOrWhiteSpace(entity)) query = query.Where(a => a.Entity == entity);
            if (entityId is not null) query = query.Where(a => a.EntityId == entityId);
            if (!string.IsNullOrWhiteSpace(q)) query = query.Where(a => a.Details.Contains(q) || a.User.Contains(q));
            return await query.OrderByDescending(a => a.Id).Take(Math.Clamp(take, 1, 1000)).ToListAsync();
        });

        api.MapGet("/audit/verify", async (AuditService audit) =>
        {
            var (ok, brokenAt, count) = await audit.VerifyAsync();
            return new { ok, brokenAt, count };
        });

        // ===================== الإعدادات =====================
        api.MapGet("/settings", (ClassificationService cls) => cls.GetSettingsAsync());
        api.MapPut("/settings", async (SystemSettings input, HttpContext ctx, AppDbContext db, AuditService audit) =>
        {
            var user = CurrentUser.From(ctx);
            if (!user.Is()) return Forbid("تعديل المعايير من صلاحية مدير النظام");
            if (input.TierCMin <= 0 || input.TierBMin <= input.TierCMin || input.TierAMin <= input.TierBMin || input.MaxTenderToCapitalRatio is <= 0 or > 1 || input.ExpiryWarningDays is < 1 or > 365)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["Settings"] = new[] { "تحقق من القيم: حد الفئة (أ) أكبر من (ب)، وحد (ب) أكبر من (ج)، والنسبة بين 1% و100%، وأيام التنبيه بين 1 و365" } });
            var s = await db.Settings.FirstAsync();
            var details = $"الفئة أ ≥ {s.TierAMin:N0} ← {input.TierAMin:N0}، الفئة ب ≥ {s.TierBMin:N0} ← {input.TierBMin:N0}، الفئة ج ≥ {s.TierCMin:N0} ← {input.TierCMin:N0}، النسبة {s.MaxTenderToCapitalRatio:P0} ← {input.MaxTenderToCapitalRatio:P0}، التنبيه {s.ExpiryWarningDays} ← {input.ExpiryWarningDays} يوم";
            s.TierAMin = input.TierAMin; s.TierBMin = input.TierBMin; s.TierCMin = input.TierCMin; s.MaxTenderToCapitalRatio = input.MaxTenderToCapitalRatio; s.ExpiryWarningDays = input.ExpiryWarningDays;
            await audit.LogAsync(user, "UpdateSettings", "Settings", 1, details);
            await db.SaveChangesAsync();
            return Results.Ok(s);
        });
    }

    // ===================== أدوات مساعدة =====================
    private static IResult Forbid(string message) => Results.Json(new { title = message }, statusCode: 403);
    private static IResult Problem(string message) => Results.Json(new { title = message }, statusCode: 400);

    public static string DocAr(DocumentType t) => Catalog.Doc(t).NameAr;

    private static List<DocumentType> MissingDocs(Supplier s, IEnumerable<DocumentType> types) =>
        types.Where(t => s.Documents.All(d => d.Type != t)).ToList();

    private static string UploadDir(IWebHostEnvironment env)
    {
        var dir = Path.Combine(env.ContentRootPath, "App_Data", "uploads");
        Directory.CreateDirectory(dir);
        return dir;
    }

    private static List<string> Split(string? v) => (v ?? "").Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList();

    private static void Recompute(Supplier s)
    {
        if (s.Status is SupplierStatus.Suspended or SupplierStatus.Rejected) return;
        if (s.FinancialApproval == ApprovalState.Returned || s.LegalApproval == ApprovalState.Returned || s.ActivationApproval == ApprovalState.Returned)
            s.Status = SupplierStatus.Returned;
        else if (s.FinancialApproval == ApprovalState.Approved && s.LegalApproval == ApprovalState.Approved
                 && s.ActivationApproval == ApprovalState.Approved && EligibilityEngine.MissingCoreData(s).Count == 0)
            s.Status = SupplierStatus.Qualified;
        else s.Status = SupplierStatus.PendingVerification;
    }

    private static Dictionary<string, string> Snapshot(Supplier s) =>
        typeof(SupplierInput).GetProperties().Select(p => p.Name)
            .ToDictionary(n => n, n => typeof(Supplier).GetProperty(n)?.GetValue(s)?.ToString() ?? "");

    private static dynamic Summary(Supplier x, SystemSettings s)
    {
        var alerts = Alerts(x, s);
        return new
        {
            id = x.Id, code = x.Code, nameAr = x.NameAr, nameEn = x.NameEn, city = x.City, legalForm = x.LegalForm,
            mainActivity = x.MainActivity, subActivities = Split(x.SubActivities), capital = x.Capital,
            tier = ClassificationService.Classify(x.Capital, s).ToString(), status = x.Status.ToString(),
            financialApproval = x.FinancialApproval.ToString(), legalApproval = x.LegalApproval.ToString(), activationApproval = x.ActivationApproval.ToString(),
            commercialRegNo = x.CommercialRegNo, commercialRegExpiryDate = x.CommercialRegExpiryDate,
            practiceLicenseExpiryDate = x.PracticeLicenseExpiryDate,
            missing = EligibilityEngine.MissingCoreData(x).Count,
            alertLevel = alerts.Any(a => a.severity == "danger") ? "danger" : alerts.Any() ? "warning" : "ok"
        };
    }

    private record AlertItem(string type, string label, DateOnly date, int days, string severity);

    private static List<AlertItem> Alerts(Supplier x, SystemSettings s)
    {
        var today = DateOnly.FromDateTime(DateTime.Today);
        var list = new List<AlertItem>();
        void Check(string type, string label, DateOnly? d)
        {
            if (d is null) return;
            var days = d.Value.DayNumber - today.DayNumber;
            if (days < 0) list.Add(new(type, label, d.Value, days, "danger"));
            else if (days <= s.ExpiryWarningDays) list.Add(new(type, label, d.Value, days, "warning"));
        }
        Check("CommercialRegistry", "السجل التجاري", x.CommercialRegExpiryDate);
        Check("PracticeLicense", "إذن مزاولة النشاط", x.PracticeLicenseExpiryDate);
        Check("Lease", "عقد إيجار المقر", x.LeaseExpiryDate);
        return list;
    }

    private static string Csv(object? v)
    {
        var s = v switch { null => "", DateOnly d => d.ToString("yyyy-MM-dd"), _ => v.ToString() ?? "" };
        return s.IndexOfAny(new[] { ',', '"', '\n' }) >= 0 ? $"\"{s.Replace("\"", "\"\"")}\"" : s;
    }

    private static IResult Csv(StringBuilder sb, string name) =>
        Results.File(Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(sb.ToString())).ToArray(), "text/csv; charset=utf-8", name);
}
