using System.ComponentModel.DataAnnotations;

namespace SupplierSystem.Models;

/// <summary>حالة المورد في دورة حياة التأهيل.</summary>
public enum SupplierStatus
{
    PendingVerification, // قيد المراجعة
    Qualified,           // نشط ومؤهل
    Returned,            // مُرجع للتصحيح
    Suspended,           // موقوف
    Rejected             // مرفوض
}

public enum ApprovalState { Pending, Approved, Returned }

/// <summary>A ≥ 100 مليون، B ≥ 50 مليون، C ≥ 5 ملايين، U أقل من الحد الأدنى (غير مصنف).</summary>
public enum CapitalTier { A, B, C, U }

public enum DocumentType
{
    CommercialRegistry,   // السجل التجاري
    PracticeLicense,      // إذن / ترخيص مزاولة النشاط
    RealEstateRegistry,   // السجل العقاري (عقد/شهادة مقر الشركة)
    IncorporationContract,// عقد التأسيس
    TaxCertificate,       // شهادة سداد ضريبي
    ChamberCertificate,   // شهادة الغرفة التجارية
    BankLetter,           // إفادة مصرفية برأس المال
    Other,
    SocialSecurityCertificate, // شهادة الضمان الاجتماعي (براءة ذمة)
    AuditedFinancials,         // القوائم المالية المدققة
    SignatoryAuthorization,    // تفويض المفوض بالتوقيع
    QualityCertificate,        // شهادات الجودة والخبرات
    ClassificationCertificate  // شهادة التصنيف / الوكالة التجارية
}

public class Supplier
{
    public int Id { get; set; }
    [MaxLength(20)] public string Code { get; set; } = "";

    // ---------- البيانات الأساسية ----------
    [Required, MaxLength(200)] public string NameAr { get; set; } = "";
    [MaxLength(200)] public string? NameEn { get; set; }
    [MaxLength(60)] public string LegalForm { get; set; } = "";     // شركة مساهمة، ذات مسؤولية محدودة...
    [MaxLength(60)] public string City { get; set; } = "";
    [MaxLength(300)] public string? Address { get; set; }
    [MaxLength(30)] public string? Phone { get; set; }
    [MaxLength(120)] public string? Email { get; set; }
    [MaxLength(150)] public string? Website { get; set; }
    [MaxLength(120)] public string? ContactPerson { get; set; }
    [MaxLength(30)] public string? ContactPhone { get; set; }

    // ---------- النشاط ----------
    [MaxLength(80)] public string MainActivity { get; set; } = "";
    /// <summary>أنشطة فرعية مفصولة بفاصلة منقوطة.</summary>
    [MaxLength(500)] public string? SubActivities { get; set; }

    // ---------- السجل التجاري ----------
    [MaxLength(40)] public string CommercialRegNo { get; set; } = "";
    [MaxLength(80)] public string? CommercialRegOffice { get; set; }
    public DateOnly? CommercialRegIssueDate { get; set; }
    public DateOnly? CommercialRegExpiryDate { get; set; }
    [MaxLength(40)] public string? ChamberNo { get; set; }
    [MaxLength(40)] public string? TaxNo { get; set; }

    // ---------- مزاولة النشاط ----------
    [MaxLength(40)] public string? PracticeLicenseNo { get; set; }
    [MaxLength(120)] public string? PracticeLicenseAuthority { get; set; }
    public DateOnly? PracticeLicenseIssueDate { get; set; }
    public DateOnly? PracticeLicenseExpiryDate { get; set; }

    // ---------- السجل العقاري (مقر الشركة) ----------
    [MaxLength(40)] public string? RealEstateRegNo { get; set; }
    [MaxLength(120)] public string? RealEstateOffice { get; set; }
    public DateOnly? RealEstateRegDate { get; set; }
    [MaxLength(20)] public string? PremisesOwnership { get; set; } // ملك / إيجار
    public DateOnly? LeaseExpiryDate { get; set; }
    [MaxLength(300)] public string? PropertyDescription { get; set; }

    // ---------- عقد التأسيس ----------
    [MaxLength(40)] public string? IncorporationContractNo { get; set; }
    public DateOnly? IncorporationDate { get; set; }
    [MaxLength(120)] public string? NotaryOffice { get; set; }
    [MaxLength(120)] public string? AuthorizedSignatory { get; set; }
    [MaxLength(1000)] public string? Partners { get; set; }  // سطر لكل شريك: الاسم | النسبة

    // ---------- البيانات المالية ----------
    public decimal Capital { get; set; }
    public decimal? PaidUpCapital { get; set; }
    [MaxLength(80)] public string? BankName { get; set; }
    [MaxLength(40)] public string? BankAccount { get; set; }

    // ---------- التأهيل ----------
    public SupplierStatus Status { get; set; } = SupplierStatus.PendingVerification;
    public ApprovalState FinancialApproval { get; set; } = ApprovalState.Pending;
    [MaxLength(80)] public string? FinancialApprovedBy { get; set; }
    public DateTime? FinancialApprovedAt { get; set; }
    [MaxLength(500)] public string? FinancialNotes { get; set; }
    public ApprovalState LegalApproval { get; set; } = ApprovalState.Pending;
    [MaxLength(80)] public string? LegalApprovedBy { get; set; }
    public DateTime? LegalApprovedAt { get; set; }
    [MaxLength(500)] public string? LegalNotes { get; set; }
    /// <summary>المرحلة الثالثة الإلزامية: اعتماد التفعيل من إدارة الفرع.</summary>
    public ApprovalState ActivationApproval { get; set; } = ApprovalState.Pending;
    [MaxLength(80)] public string? ActivationApprovedBy { get; set; }
    public DateTime? ActivationApprovedAt { get; set; }
    [MaxLength(500)] public string? ActivationNotes { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public List<SupplierDocument> Documents { get; set; } = new();
}

public class SupplierDocument
{
    public int Id { get; set; }
    public int SupplierId { get; set; }
    public DocumentType Type { get; set; }
    [MaxLength(200)] public string FileName { get; set; } = "";
    [MaxLength(80)] public string StoredName { get; set; } = "";
    [MaxLength(100)] public string ContentType { get; set; } = "";
    public long Size { get; set; }
    public DateTime UploadedAt { get; set; } = DateTime.UtcNow;
    [MaxLength(80)] public string? UploadedBy { get; set; }
}

public class Tender
{
    public int Id { get; set; }
    [MaxLength(30)] public string RefNo { get; set; } = "";
    [Required, MaxLength(250)] public string Title { get; set; } = "";
    [MaxLength(80)] public string Activity { get; set; } = "";
    public decimal Value { get; set; }
    public DateOnly ClosingDate { get; set; }
    [MaxLength(1000)] public string? Description { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    [MaxLength(80)] public string? CreatedBy { get; set; }
    public List<TenderInvitation> Invitations { get; set; } = new();
}

public class TenderInvitation
{
    public int Id { get; set; }
    public int TenderId { get; set; }
    public int SupplierId { get; set; }
    public Supplier? Supplier { get; set; }
    public decimal CapitalUtilization { get; set; }
}

/// <summary>سجل تدقيق مُسلسل بسلسلة تجزئة (Hash chain) لكشف أي تعديل.</summary>
public class AuditLog
{
    public long Id { get; set; }
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    [MaxLength(80)] public string User { get; set; } = "";
    [MaxLength(40)] public string Role { get; set; } = "";
    [MaxLength(60)] public string Action { get; set; } = "";
    [MaxLength(40)] public string Entity { get; set; } = "";
    public int? EntityId { get; set; }
    [MaxLength(2000)] public string Details { get; set; } = "";
    [MaxLength(64)] public string PrevHash { get; set; } = "";
    [MaxLength(64)] public string Hash { get; set; } = "";
}

/// <summary>مستخدم المنظومة: الدخول بالبريد الإلكتروني أو الرقم الوظيفي مع كلمة المرور.</summary>
public class AppUser
{
    public int Id { get; set; }
    [MaxLength(20)] public string EmployeeNo { get; set; } = "";
    [MaxLength(200)] public string Email { get; set; } = "";
    [MaxLength(200)] public string FullName { get; set; } = "";
    [MaxLength(30)] public string Role { get; set; } = "Procurement";
    [MaxLength(200)] public string PasswordHash { get; set; } = "";
    public bool IsActive { get; set; } = true;
    /// <summary>يُطلب من المستخدم تغيير كلمة المرور المؤقتة عند أول دخول.</summary>
    public bool MustChangePassword { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? LastLoginAt { get; set; }
}

/// <summary>معايير النظام القابلة للتعديل (FR-02).</summary>
public class SystemSettings
{
    public int Id { get; set; } = 1;
    public decimal TierAMin { get; set; } = 100_000_000m;
    public decimal TierBMin { get; set; } = 50_000_000m;
    /// <summary>الحد الأدنى للتصنيف (فئة ج)؛ ما دونه «غير مصنف» ولا يُرشح للمناقصات.</summary>
    public decimal TierCMin { get; set; } = 5_000_000m;
    /// <summary>أقصى نسبة لقيمة المناقصة من رأس مال المورد (BR-04).</summary>
    public decimal MaxTenderToCapitalRatio { get; set; } = 0.50m;
    public int ExpiryWarningDays { get; set; } = 60;
}

public static class Catalog
{
    public static readonly string[] Activities =
    {
        "مقاولات عامة ومباني",
        "توريد مواد البناء",
        "تقنية المعلومات والاتصالات",
        "معدات ومستلزمات طبية",
        "أدوية ومستحضرات صيدلانية",
        "توريد مواد غذائية",
        "نقل وخدمات لوجستية",
        "أثاث ومستلزمات مكتبية",
        "كهرباء وطاقة متجددة",
        "خدمات نفطية",
        "صيانة وتشغيل",
        "استشارات هندسية",
        "أمن وسلامة",
        "نظافة وخدمات عامة",
        "مركبات وقطع غيار",
        "طباعة وقرطاسية"
    };

    public static readonly string[] LegalForms =
    {
        "شركة مساهمة", "شركة ذات مسؤولية محدودة", "شركة تضامن", "شركة توصية بسيطة", "منشأة فردية", "فرع شركة أجنبية"
    };

    public static readonly string[] Cities =
    {
        "طرابلس", "بنغازي", "مصراتة", "الزاوية", "زليتن", "الخمس", "سبها", "البيضاء", "طبرق", "سرت", "غريان", "صبراتة", "درنة", "أجدابيا"
    };

    public static readonly string[] Roles = { "Procurement", "Finance", "Legal", "Management", "Admin" };

    /// <summary>
    /// دليل المستندات الرسمية للمورد: المجموعة، والإلزام، والمرحلة التي تشترطه.
    /// الإلزامي يُشترط عند اعتماد مرحلته (المالية أو القانونية)، وكلها تُشترط عند اعتماد التفعيل.
    /// </summary>
    public record DocSpec(DocumentType Type, string NameAr, string Group, bool Required, string? Stage, string Hint);

    public static readonly DocSpec[] Documents =
    {
        new(DocumentType.CommercialRegistry, "السجل التجاري", "legal", true, "legal", "ساري حتى تاريخ إقفال المناقصة"),
        new(DocumentType.PracticeLicense, "إذن مزاولة النشاط", "legal", true, "legal", "صادر من الجهة المختصة بالنشاط"),
        new(DocumentType.RealEstateRegistry, "السجل العقاري / سند المقر", "legal", true, "legal", "ملكية المقر أو عقد إيجاره"),
        new(DocumentType.IncorporationContract, "عقد التأسيس والنظام الأساسي", "legal", false, null, "الشكل القانوني والشركاء"),
        new(DocumentType.TaxCertificate, "شهادة السداد الضريبي", "financial", true, "financial", "براءة ذمة سارية من مصلحة الضرائب"),
        new(DocumentType.BankLetter, "الإفادة المصرفية برأس المال", "financial", true, "financial", "تؤكد الحساب ورأس المال المودع"),
        new(DocumentType.SocialSecurityCertificate, "شهادة الضمان الاجتماعي", "financial", false, null, "براءة ذمة من صندوق الضمان"),
        new(DocumentType.AuditedFinancials, "القوائم المالية المدققة", "financial", false, null, "ميزانية آخر سنة مالية"),
        new(DocumentType.ChamberCertificate, "شهادة الغرفة التجارية", "additional", false, null, "القيد في غرفة التجارة والصناعة"),
        new(DocumentType.SignatoryAuthorization, "تفويض المفوض بالتوقيع", "additional", false, null, "مع إثبات هوية المفوض"),
        new(DocumentType.QualityCertificate, "شهادات الجودة والخبرات", "additional", false, null, "مثل ISO وشهادات إنجاز الأعمال"),
        new(DocumentType.ClassificationCertificate, "شهادة التصنيف / الوكالة", "additional", false, null, "تصنيف المقاولين أو الوكالة التجارية"),
        new(DocumentType.Other, "وثائق أخرى", "additional", false, null, ""),
    };

    public static DocSpec Doc(DocumentType t) => Documents.First(d => d.Type == t);

    /// <summary>المستندات الإلزامية لتفعيل المورد.</summary>
    public static readonly DocumentType[] CoreDocuments = Documents.Where(d => d.Required).Select(d => d.Type).ToArray();

    /// <summary>المستندات الإلزامية التي تشترطها مرحلة معينة (financial / legal).</summary>
    public static DocumentType[] StageDocuments(string stage) => Documents.Where(d => d.Required && d.Stage == stage).Select(d => d.Type).ToArray();
}
