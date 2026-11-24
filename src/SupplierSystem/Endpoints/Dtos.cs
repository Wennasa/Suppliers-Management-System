using System.Net.Mail;
using SupplierSystem.Models;

namespace SupplierSystem.Endpoints;

/// <summary>نموذج إدخال المورد — لا يتضمن حقول الاعتماد حتى لا يمكن تجاوز سير العمل (Over-posting).</summary>
public class SupplierInput
{
    public string NameAr { get; set; } = "";
    public string? NameEn { get; set; }
    public string LegalForm { get; set; } = "";
    public string City { get; set; } = "";
    public string? Address { get; set; }
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public string? Website { get; set; }
    public string? ContactPerson { get; set; }
    public string? ContactPhone { get; set; }
    public string MainActivity { get; set; } = "";
    public List<string>? SubActivities { get; set; }
    public string CommercialRegNo { get; set; } = "";
    public string? CommercialRegOffice { get; set; }
    public DateOnly? CommercialRegIssueDate { get; set; }
    public DateOnly? CommercialRegExpiryDate { get; set; }
    public string? ChamberNo { get; set; }
    public string? TaxNo { get; set; }
    public string? PracticeLicenseNo { get; set; }
    public string? PracticeLicenseAuthority { get; set; }
    public DateOnly? PracticeLicenseIssueDate { get; set; }
    public DateOnly? PracticeLicenseExpiryDate { get; set; }
    public string? RealEstateRegNo { get; set; }
    public string? RealEstateOffice { get; set; }
    public DateOnly? RealEstateRegDate { get; set; }
    public string? PremisesOwnership { get; set; }
    public DateOnly? LeaseExpiryDate { get; set; }
    public string? PropertyDescription { get; set; }
    public string? IncorporationContractNo { get; set; }
    public DateOnly? IncorporationDate { get; set; }
    public string? NotaryOffice { get; set; }
    public string? AuthorizedSignatory { get; set; }
    public string? Partners { get; set; }
    public decimal Capital { get; set; }
    public decimal? PaidUpCapital { get; set; }
    public string? BankName { get; set; }
    public string? BankAccount { get; set; }

    public Dictionary<string, string[]> Validate()
    {
        var e = new Dictionary<string, string[]>();
        void Add(string k, string m) => e[k] = e.TryGetValue(k, out var v) ? v.Append(m).ToArray() : new[] { m };

        if (string.IsNullOrWhiteSpace(NameAr) || NameAr.Trim().Length < 3) Add(nameof(NameAr), "اسم المورد مطلوب (3 أحرف على الأقل)");
        if (string.IsNullOrWhiteSpace(LegalForm)) Add(nameof(LegalForm), "الشكل القانوني مطلوب");
        if (string.IsNullOrWhiteSpace(City)) Add(nameof(City), "المدينة مطلوبة");
        if (!Catalog.Activities.Contains(MainActivity)) Add(nameof(MainActivity), "اختر النشاط الرئيسي من القائمة");
        if (SubActivities?.Any(a => !Catalog.Activities.Contains(a)) == true) Add(nameof(SubActivities), "نشاط فرعي غير معروف");
        if (!string.IsNullOrWhiteSpace(Email) && !MailAddress.TryCreate(Email, out _)) Add(nameof(Email), "البريد الإلكتروني غير صحيح");

        if (string.IsNullOrWhiteSpace(CommercialRegNo)) Add(nameof(CommercialRegNo), "رقم السجل التجاري مطلوب");
        if (CommercialRegIssueDate > CommercialRegExpiryDate) Add(nameof(CommercialRegExpiryDate), "تاريخ الانتهاء يجب أن يكون بعد تاريخ الإصدار");
        if (PracticeLicenseIssueDate > PracticeLicenseExpiryDate) Add(nameof(PracticeLicenseExpiryDate), "تاريخ الانتهاء يجب أن يكون بعد تاريخ الإصدار");
        if (IncorporationDate > DateOnly.FromDateTime(DateTime.Today)) Add(nameof(IncorporationDate), "تاريخ التأسيس لا يمكن أن يكون مستقبلياً");

        if (Capital <= 0) Add(nameof(Capital), "رأس المال يجب أن يكون أكبر من صفر");
        if (PaidUpCapital < 0 || PaidUpCapital > Capital) Add(nameof(PaidUpCapital), "رأس المال المدفوع يجب أن يكون بين صفر ورأس المال المعلن");
        return e;
    }

    public void ApplyTo(Supplier s)
    {
        static string? T(string? v) => string.IsNullOrWhiteSpace(v) ? null : v.Trim();
        s.NameAr = NameAr.Trim(); s.NameEn = T(NameEn); s.LegalForm = LegalForm; s.City = City;
        s.Address = T(Address); s.Phone = T(Phone); s.Email = T(Email); s.Website = T(Website);
        s.ContactPerson = T(ContactPerson); s.ContactPhone = T(ContactPhone);
        s.MainActivity = MainActivity;
        s.SubActivities = string.Join(";", (SubActivities ?? new()).Where(a => a != MainActivity).Distinct());
        s.CommercialRegNo = CommercialRegNo.Trim(); s.CommercialRegOffice = T(CommercialRegOffice);
        s.CommercialRegIssueDate = CommercialRegIssueDate; s.CommercialRegExpiryDate = CommercialRegExpiryDate;
        s.ChamberNo = T(ChamberNo); s.TaxNo = T(TaxNo);
        s.PracticeLicenseNo = T(PracticeLicenseNo); s.PracticeLicenseAuthority = T(PracticeLicenseAuthority);
        s.PracticeLicenseIssueDate = PracticeLicenseIssueDate; s.PracticeLicenseExpiryDate = PracticeLicenseExpiryDate;
        s.RealEstateRegNo = T(RealEstateRegNo); s.RealEstateOffice = T(RealEstateOffice); s.RealEstateRegDate = RealEstateRegDate;
        s.PremisesOwnership = T(PremisesOwnership); s.LeaseExpiryDate = PremisesOwnership == "إيجار" ? LeaseExpiryDate : null;
        s.PropertyDescription = T(PropertyDescription);
        s.IncorporationContractNo = T(IncorporationContractNo); s.IncorporationDate = IncorporationDate;
        s.NotaryOffice = T(NotaryOffice); s.AuthorizedSignatory = T(AuthorizedSignatory); s.Partners = T(Partners);
        s.Capital = Capital; s.PaidUpCapital = PaidUpCapital; s.BankName = T(BankName); s.BankAccount = T(BankAccount);
    }
}

public record LoginInput(string? Identifier, string? Password);
public record UserInput(string? EmployeeNo, string? Email, string? FullName, string? Role, bool IsActive = true);
public record ChangePasswordInput(string? EmployeeNo, string? CurrentPassword, string? NewPassword);
public record ReviewInput(string Track, string Decision, string? Notes);
public record StatusInput(SupplierStatus Status, string? Reason);
public record TenderInput(string Title, string Activity, decimal Value, DateOnly ClosingDate, string? Description, List<int>? SupplierIds);
