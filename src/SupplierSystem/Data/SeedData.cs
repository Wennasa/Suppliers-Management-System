using SupplierSystem.Models;
using SupplierSystem.Services;

namespace SupplierSystem.Data;

/// <summary>بيانات تجريبية: 30 مورداً بأسماء افتراضية (غير حقيقية) بمستويات رأس مال وحالات متنوعة لاختبار محرك الترشيح.</summary>
public static class SeedData
{
    // الاسم، الاسم اللاتيني، الشكل القانوني، المدينة، النشاط الرئيسي، أنشطة فرعية، رأس المال، الحالة، ملاحظة السيناريو
    private record Row(string Ar, string En, int Form, int City, int Act, int[] Subs, decimal Capital, string Scenario);

    private static readonly Row[] Rows =
    {
        new("شركة الأفق الجديد للمقاولات العامة", "New Horizon General Contracting", 0, 0, 0, new[]{1,10}, 250_000_000, "ok"),
        new("شركة البنيان المرصوص للإنشاءات", "Al-Bunyan Construction", 1, 1, 0, new[]{1}, 120_000_000, "ok"),
        new("شركة المدار لتقنية المعلومات", "Al-Madar IT Solutions", 1, 0, 2, new[]{10,15}, 35_000_000, "ok"),
        new("شركة الشفاء للمعدات الطبية", "Al-Shifa Medical Equipment", 1, 2, 3, new[]{4}, 22_000_000, "ok"),
        new("شركة النخبة للأدوية", "Elite Pharma", 0, 0, 4, new[]{3}, 85_000_000, "ok"),
        new("شركة الواحة لتوريد المواد الغذائية", "Oasis Food Supply", 1, 6, 5, new[]{6}, 6_500_000, "ok"),
        new("شركة الساحل للنقل والخدمات اللوجستية", "Coastal Logistics", 1, 3, 6, new[]{14}, 18_000_000, "ok"),
        new("شركة الريادة للأثاث المكتبي", "Riyada Office Furniture", 2, 0, 7, new[]{15}, 5_500_000, "ok"),
        new("شركة النور للكهرباء والطاقة المتجددة", "Al-Noor Power & Renewables", 0, 2, 8, new[]{10,0}, 150_000_000, "ok"),
        new("شركة الصحراء للخدمات النفطية", "Sahara Oilfield Services", 0, 9, 9, new[]{10,12}, 300_000_000, "ok"),
        new("شركة الإتقان للصيانة والتشغيل", "Itqan O&M", 1, 1, 10, new[]{8,13}, 12_000_000, "ok"),
        new("المكتب الاستشاري الهندسي المتحد", "United Engineering Consultants", 1, 0, 11, new[]{0}, 7_500_000, "ok"),
        new("شركة الحصن للأمن والسلامة", "Al-Hisn Security & Safety", 1, 4, 12, new[]{10}, 6_000_000, "ok"),
        new("شركة البريق للنظافة والخدمات العامة", "Bareeq Cleaning Services", 4, 5, 13, new[]{10}, 5_200_000, "ok"),
        new("شركة الطريق السريع للمركبات وقطع الغيار", "Highway Motors & Parts", 1, 2, 14, new[]{6}, 60_000_000, "ok"),
        new("شركة الكلمة للطباعة والقرطاسية", "Al-Kalima Printing", 4, 7, 15, new[]{7}, 5_000_000, "ok"),
        new("شركة الرمال الذهبية لمواد البناء", "Golden Sands Building Materials", 1, 1, 1, new[]{0}, 55_000_000, "ok"),
        new("شركة جسور للمقاولات", "Jusoor Contracting", 1, 10, 0, new[]{1,11}, 75_000_000, "ok"),
        new("شركة الشبكة الذكية للاتصالات", "Smart Grid Telecom", 0, 1, 2, new[]{8}, 95_000_000, "ok"),
        new("شركة الحياة للمستلزمات الطبية", "Al-Hayat Medical Supplies", 1, 8, 3, new[]{4}, 9_000_000, "ok"),
        new("شركة السنابل للمواد الغذائية", "Sanabel Foods", 1, 3, 5, Array.Empty<int>(), 70_000_000, "ok"),
        new("شركة القافلة للنقل البري", "Caravan Land Transport", 3, 6, 6, Array.Empty<int>(), 8_000_000, "ok"),
        new("شركة الإعمار الحديث", "Modern Ieemar", 1, 2, 0, new[]{1}, 110_000_000, "cr-expired"),
        new("شركة البرمجيات المتقدمة", "Advanced Software Co.", 1, 0, 2, Array.Empty<int>(), 28_000_000, "license-expired"),
        new("شركة الطاقة الخضراء", "Green Energy Co.", 1, 11, 8, Array.Empty<int>(), 65_000_000, "pending"),
        new("شركة الدواء الآمن", "Safe Medicine Co.", 1, 1, 4, new[]{3}, 15_000_000, "activation-pending"),
        new("شركة البناء المتين", "Solid Build Co.", 2, 12, 0, new[]{1}, 10_000_000, "returned"),
        new("شركة الأمان للصيانة", "Al-Aman Maintenance", 4, 13, 10, Array.Empty<int>(), 6_200_000, "expiring"),
        new("شركة المستقبل للتقنية", "Future Tech", 1, 2, 2, new[]{7}, 8_500_000, "incomplete"),
        new("شركة القمة للمقاولات والتوريدات", "Summit Contracting & Supply", 0, 0, 0, new[]{1,5,7}, 180_000_000, "suspended"),
    };

    private static readonly string[] Banks = { "مصرف الجمهورية", "المصرف التجاري الوطني", "مصرف الوحدة", "مصرف الصحاري", "مصرف شمال أفريقيا", "مصرف التجارة والتنمية" };
    private static readonly string[] People = { "أحمد سالم", "محمد علي", "خالد عمر", "فاطمة يوسف", "سعاد إبراهيم", "عبدالله منصور", "مريم الهادي", "طارق مفتاح", "نوري عبدالسلام", "هدى رمضان" };

    public static List<Supplier> Build()
    {
        var today = DateOnly.FromDateTime(DateTime.Today);
        var list = new List<Supplier>();
        for (var i = 0; i < Rows.Length; i++)
        {
            var r = Rows[i];
            var n = i + 1;
            var city = Catalog.Cities[r.City];
            var incYear = 2005 + (i * 7 % 17);
            var s = new Supplier
            {
                Code = $"SUP-{n:0000}",
                NameAr = r.Ar,
                NameEn = r.En,
                LegalForm = Catalog.LegalForms[r.Form],
                City = city,
                Address = $"{city} - شارع {(n % 2 == 0 ? "الجمهورية" : "عمر المختار")} - مبنى رقم {10 + n}",
                Phone = $"0{21 + r.City}-{3000000 + n * 1371:0000000}",
                Email = $"info@{r.En.Split(' ')[0].ToLowerInvariant().Replace("-", "")}{n}.ly",
                Website = $"www.{r.En.Split(' ')[0].ToLowerInvariant().Replace("-", "")}{n}.ly",
                ContactPerson = People[i % People.Length],
                ContactPhone = $"09{(i % 2 == 0 ? 1 : 2)}-{4000000 + n * 2711:0000000}",
                MainActivity = Catalog.Activities[r.Act],
                SubActivities = string.Join(";", r.Subs.Select(x => Catalog.Activities[x])),

                CommercialRegNo = $"CR-{1000 + r.City * 100}-{20000 + n * 37}",
                CommercialRegOffice = $"مكتب السجل التجاري - {city}",
                CommercialRegIssueDate = today.AddYears(-1).AddDays(-n * 9),
                CommercialRegExpiryDate = today.AddYears(1).AddDays(n * 11 % 300),
                ChamberNo = $"CH-{5000 + n * 13}",
                TaxNo = $"TX-{700000 + n * 97}",

                PracticeLicenseNo = $"PL-{2024}-{300 + n * 7}",
                PracticeLicenseAuthority = $"مراقبة الاقتصاد - {city}",
                PracticeLicenseIssueDate = today.AddMonths(-8).AddDays(-n),
                PracticeLicenseExpiryDate = today.AddMonths(16).AddDays(n * 5),

                RealEstateRegNo = $"RE-{r.City + 1:00}/{1500 + n * 23}",
                RealEstateOffice = $"مصلحة التسجيل العقاري - {city}",
                RealEstateRegDate = new DateOnly(incYear + 1, 1 + n % 12, 1 + n % 27),
                PremisesOwnership = n % 3 == 0 ? "إيجار" : "ملك",
                PropertyDescription = n % 4 == 0 ? "مقر إداري ومخزن" : "مقر إداري",

                IncorporationContractNo = $"INC-{incYear}-{100 + n}",
                IncorporationDate = new DateOnly(incYear, 1 + (n * 5 % 12), 1 + n % 27),
                NotaryOffice = $"مكتب التوثيق - {city}",
                AuthorizedSignatory = People[(i + 3) % People.Length],
                Partners = $"{People[(i + 3) % People.Length]} | 60%\n{People[(i + 5) % People.Length]} | 40%",

                Capital = r.Capital,
                PaidUpCapital = Math.Round(r.Capital * (0.5m + (n % 6) * 0.1m), 0),
                BankName = Banks[i % Banks.Length],
                BankAccount = $"LY{(10 + n):00}0{n % 9}{100200300 + n * 11111}",

                Status = SupplierStatus.Qualified,
                FinancialApproval = ApprovalState.Approved,
                FinancialApprovedBy = "المراجع المالي",
                FinancialApprovedAt = DateTime.UtcNow.AddDays(-30 + n % 20),
                LegalApproval = ApprovalState.Approved,
                LegalApprovedBy = "المستشار القانوني",
                LegalApprovedAt = DateTime.UtcNow.AddDays(-28 + n % 20),
                ActivationApproval = ApprovalState.Approved,
                ActivationApprovedBy = "إدارة الفرع",
                ActivationApprovedAt = DateTime.UtcNow.AddDays(-27 + n % 20),
                CreatedAt = DateTime.UtcNow.AddDays(-60 + n),
                UpdatedAt = DateTime.UtcNow.AddDays(-20 + n % 10),
            };
            if (s.PremisesOwnership == "إيجار") s.LeaseExpiryDate = today.AddMonths(10 + n % 12);

            switch (r.Scenario)
            {
                case "cr-expired":
                    s.CommercialRegExpiryDate = today.AddDays(-25);
                    break;
                case "license-expired":
                    s.PracticeLicenseExpiryDate = today.AddDays(-40);
                    break;
                case "pending":
                    s.Status = SupplierStatus.PendingVerification;
                    s.FinancialApproval = s.LegalApproval = s.ActivationApproval = ApprovalState.Pending;
                    s.FinancialApprovedBy = s.LegalApprovedBy = s.ActivationApprovedBy = null;
                    s.FinancialApprovedAt = s.LegalApprovedAt = s.ActivationApprovedAt = null;
                    break;
                case "activation-pending": // اجتاز المراجعتين وينتظر اعتماد إدارة الفرع
                    s.Status = SupplierStatus.PendingVerification;
                    s.ActivationApproval = ApprovalState.Pending; s.ActivationApprovedBy = null; s.ActivationApprovedAt = null;
                    break;
                case "returned":
                    s.Status = SupplierStatus.Returned;
                    s.LegalApproval = ApprovalState.Returned;
                    s.ActivationApproval = ApprovalState.Pending; s.ActivationApprovedBy = null; s.ActivationApprovedAt = null;
                    s.LegalNotes = "سند المقر المرفق غير واضح - يرجى إرفاق نسخة مصدقة من السجل العقاري.";
                    break;
                case "expiring":
                    s.CommercialRegExpiryDate = today.AddDays(18);
                    s.PracticeLicenseExpiryDate = today.AddDays(45);
                    break;
                case "incomplete":
                    s.Status = SupplierStatus.PendingVerification;
                    s.IncorporationContractNo = null; s.RealEstateRegNo = null;
                    s.FinancialApproval = s.LegalApproval = s.ActivationApproval = ApprovalState.Pending;
                    s.FinancialApprovedBy = s.LegalApprovedBy = s.ActivationApprovedBy = null;
                    s.FinancialApprovedAt = s.LegalApprovedAt = s.ActivationApprovedAt = null;
                    break;
                case "suspended":
                    s.Status = SupplierStatus.Suspended;
                    s.LegalNotes = "إيقاف مؤقت لحين تسوية ملاحظات المراجعة الداخلية.";
                    break;
            }
            list.Add(s);
        }
        return list;
    }

    /// <summary>ملف PDF تجريبي صغير يمثل المستند (للعرض فقط).</summary>
    private static byte[] SamplePdf(string title)
    {
        var text = $"Sample document - {title}";
        var content = $"BT /F1 18 Tf 60 760 Td ({text}) Tj ET";
        var objs = new[]
        {
            "<< /Type /Catalog /Pages 2 0 R >>",
            "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
            $"<< /Length {content.Length} >>\nstream\n{content}\nendstream",
            "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
        };
        var sb = new System.Text.StringBuilder("%PDF-1.4\n");
        var offsets = new List<int>();
        for (var i = 0; i < objs.Length; i++) { offsets.Add(sb.Length); sb.Append($"{i + 1} 0 obj\n{objs[i]}\nendobj\n"); }
        var xref = sb.Length;
        sb.Append($"xref\n0 {objs.Length + 1}\n0000000000 65535 f \n");
        foreach (var o in offsets) sb.Append($"{o:D10} 00000 n \n");
        sb.Append($"trailer\n<< /Size {objs.Length + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF");
        return System.Text.Encoding.ASCII.GetBytes(sb.ToString());
    }

    public const string DemoPassword = "Demo@123";
    public record DemoUser(string No, string Email, string Name, string Role);
    public static readonly DemoUser[] DemoUsers =
    {
        new("1001", "procurement@suppliers.demo", "أحمد سالم", "Procurement"),
        new("1002", "finance@suppliers.demo", "فاطمة يوسف", "Finance"),
        new("1003", "legal@suppliers.demo", "خالد عمر", "Legal"),
        new("1004", "branch@suppliers.demo", "مريم الهادي", "Management"),
        new("1000", "admin@suppliers.demo", "طارق مفتاح", "Admin"),
    };

    public static async Task EnsureSeededAsync(AppDbContext db, AuditService audit, string uploadDir)
    {
        if (!db.Settings.Any()) db.Settings.Add(new SystemSettings());
        if (!db.Users.Any())
        {
            // حسابات تجريبية لكل دور — كلمة المرور الموحدة للعرض التجريبي: Demo@123
            foreach (var u in DemoUsers)
                db.Users.Add(new AppUser { EmployeeNo = u.No, Email = u.Email, FullName = u.Name, Role = u.Role, PasswordHash = Passwords.Hash(DemoPassword) });
        }
        if (!db.Suppliers.Any())
        {
            var suppliers = Build();
            Directory.CreateDirectory(uploadDir);
            var names = new Dictionary<DocumentType, string>
            {
                [DocumentType.CommercialRegistry] = "commercial-registry", [DocumentType.PracticeLicense] = "practice-license",
                [DocumentType.RealEstateRegistry] = "real-estate-deed", [DocumentType.IncorporationContract] = "incorporation-contract",
                [DocumentType.BankLetter] = "bank-letter", [DocumentType.TaxCertificate] = "tax-certificate",
                [DocumentType.SocialSecurityCertificate] = "social-security", [DocumentType.ChamberCertificate] = "chamber-certificate"
            };
            foreach (var s in suppliers)
            {
                foreach (var (type, name) in names)
                {
                    // المورد ذو الملف الناقص ينقصه مستندا السجل العقاري وعقد التأسيس
                    if (s.IncorporationContractNo is null && type is DocumentType.RealEstateRegistry or DocumentType.IncorporationContract) continue;
                    // المورد قيد المراجعة المالية (SUP-0025) لم يُرفق شهادة السداد الضريبي بعد
                    if (s.Code == "SUP-0025" && type == DocumentType.TaxCertificate) continue;
                    // المستندات الاختيارية مرفقة لبعض الموردين فقط
                    var num = int.Parse(s.Code[4..]);
                    if (type is DocumentType.SocialSecurityCertificate or DocumentType.ChamberCertificate && num % 3 != 0) continue;
                    var stored = $"seed-{s.Code}-{name}.pdf".ToLowerInvariant();
                    var bytes = SamplePdf($"{s.Code} {name}");
                    await File.WriteAllBytesAsync(Path.Combine(uploadDir, stored), bytes);
                    s.Documents.Add(new SupplierDocument
                    {
                        Type = type, FileName = $"{name}.pdf", StoredName = stored, ContentType = "application/pdf",
                        Size = bytes.Length, UploadedAt = s.CreatedAt, UploadedBy = "مسؤول المشتريات"
                    });
                }
            }
            db.Suppliers.AddRange(suppliers);
            await db.SaveChangesAsync();
            await audit.LogAsync(new CurrentUser("النظام", "Admin"), "Seed", "Supplier", null, "تهيئة قاعدة البيانات بـ 30 مورداً تجريبياً");
        }
        await db.SaveChangesAsync();
    }
}
