/* ============================================================
   محرك خلفي داخل المتصفح — يحاكي واجهة API لنسخة .NET بنفس القواعد
   (BR-01 → BR-04، سير الاعتماد، سجل التدقيق بسلسلة SHA-256).
   البيانات تُحفظ في متصفح المستخدم (localStorage).
   ============================================================ */
"use strict";

const ACTIVITIES = ["مقاولات عامة ومباني", "توريد مواد البناء", "تقنية المعلومات والاتصالات", "معدات ومستلزمات طبية", "أدوية ومستحضرات صيدلانية", "توريد مواد غذائية", "نقل وخدمات لوجستية", "أثاث ومستلزمات مكتبية", "كهرباء وطاقة متجددة", "خدمات نفطية", "صيانة وتشغيل", "استشارات هندسية", "أمن وسلامة", "نظافة وخدمات عامة", "مركبات وقطع غيار", "طباعة وقرطاسية"];
const LEGAL_FORMS = ["شركة مساهمة", "شركة ذات مسؤولية محدودة", "شركة تضامن", "شركة توصية بسيطة", "منشأة فردية", "فرع شركة أجنبية"];
const CITIES = ["طرابلس", "بنغازي", "مصراتة", "الزاوية", "زليتن", "الخمس", "سبها", "البيضاء", "طبرق", "سرت", "غريان", "صبراتة", "درنة", "أجدابيا"];
const ROLES = ["Procurement", "Finance", "Legal", "Management", "Admin"];
// دليل المستندات: [الاسم، إلزامي؟، المرحلة التي تشترطه]
const DOC_CATALOG = {
  CommercialRegistry: ["السجل التجاري", true, "legal"], PracticeLicense: ["إذن مزاولة النشاط", true, "legal"], RealEstateRegistry: ["السجل العقاري / سند المقر", true, "legal"],
  IncorporationContract: ["عقد التأسيس والنظام الأساسي", false, null], TaxCertificate: ["شهادة السداد الضريبي", true, "financial"], BankLetter: ["الإفادة المصرفية برأس المال", true, "financial"],
  SocialSecurityCertificate: ["شهادة الضمان الاجتماعي", false, null], AuditedFinancials: ["القوائم المالية المدققة", false, null], ChamberCertificate: ["شهادة الغرفة التجارية", false, null],
  SignatoryAuthorization: ["تفويض المفوض بالتوقيع", false, null], QualityCertificate: ["شهادات الجودة والخبرات", false, null], ClassificationCertificate: ["شهادة التصنيف / الوكالة", false, null], Other: ["وثائق أخرى", false, null]
};
const DOC_TYPE_NAMES = Object.keys(DOC_CATALOG);
const STATUS_AR = { PendingVerification: "قيد المراجعة", Qualified: "نشط ومؤهل", Returned: "مُرجع للتصحيح", Suspended: "موقوف", Rejected: "مرفوض" };
const APPROVAL_AR = { Approved: "معتمد", Returned: "مُرجع", Pending: "بانتظار" };
const DB_KEY = "ss.demo.db.v6", FILES_KEY = "ss.demo.files.v6";
const CORE_DOC_TYPES = DOC_TYPE_NAMES.filter(t => DOC_CATALOG[t][1]);
const stageDocs = st => DOC_TYPE_NAMES.filter(t => DOC_CATALOG[t][1] && DOC_CATALOG[t][2] === st);
const missingDocsOf = (s, types) => types.filter(t => !DB.documents.some(d => d.supplierId === s.id && d.type === t));
const DOC_AR = Object.fromEntries(DOC_TYPE_NAMES.map(t => [t, DOC_CATALOG[t][0]]));
const INPUT_FIELDS = ["nameAr", "nameEn", "legalForm", "city", "address", "phone", "email", "website", "contactPerson", "contactPhone", "mainActivity", "subActivities", "commercialRegNo", "commercialRegOffice", "commercialRegIssueDate", "commercialRegExpiryDate", "chamberNo", "taxNo", "practiceLicenseNo", "practiceLicenseAuthority", "practiceLicenseIssueDate", "practiceLicenseExpiryDate", "realEstateRegNo", "realEstateOffice", "realEstateRegDate", "premisesOwnership", "leaseExpiryDate", "propertyDescription", "incorporationContractNo", "incorporationDate", "notaryOffice", "authorizedSignatory", "partners", "capital", "paidUpCapital", "bankName", "bankAccount"];

// ---------- تواريخ (صيغة yyyy-mm-dd بتوقيت UTC) ----------
const todayIso = () => new Date().toISOString().slice(0, 10);
const dnum = s => Math.floor(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 864e5);
const shift = (iso, { y = 0, m = 0, d = 0 }) => { const t = new Date(iso + "T00:00:00Z"); t.setUTCFullYear(t.getUTCFullYear() + y); t.setUTCMonth(t.getUTCMonth() + m); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10); };
const ymd = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const nowIso = (offsetDays = 0) => new Date(Date.now() + offsetDays * 864e5).toISOString();
const N0 = v => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(v);
const clone = o => JSON.parse(JSON.stringify(o));

// ---------- بيانات تجريبية: 30 مورداً (أسماء افتراضية) ----------
const SEED_ROWS = [
  ["شركة الأفق الجديد للمقاولات العامة", "New Horizon General Contracting", 0, 0, 0, [1, 10], 250000000, "ok"],
  ["شركة البنيان المرصوص للإنشاءات", "Al-Bunyan Construction", 1, 1, 0, [1], 120000000, "ok"],
  ["شركة المدار لتقنية المعلومات", "Al-Madar IT Solutions", 1, 0, 2, [10, 15], 35000000, "ok"],
  ["شركة الشفاء للمعدات الطبية", "Al-Shifa Medical Equipment", 1, 2, 3, [4], 22000000, "ok"],
  ["شركة النخبة للأدوية", "Elite Pharma", 0, 0, 4, [3], 85000000, "ok"],
  ["شركة الواحة لتوريد المواد الغذائية", "Oasis Food Supply", 1, 6, 5, [6], 6500000, "ok"],
  ["شركة الساحل للنقل والخدمات اللوجستية", "Coastal Logistics", 1, 3, 6, [14], 18000000, "ok"],
  ["شركة الريادة للأثاث المكتبي", "Riyada Office Furniture", 2, 0, 7, [15], 5500000, "ok"],
  ["شركة النور للكهرباء والطاقة المتجددة", "Al-Noor Power & Renewables", 0, 2, 8, [10, 0], 150000000, "ok"],
  ["شركة الصحراء للخدمات النفطية", "Sahara Oilfield Services", 0, 9, 9, [10, 12], 300000000, "ok"],
  ["شركة الإتقان للصيانة والتشغيل", "Itqan O&M", 1, 1, 10, [8, 13], 12000000, "ok"],
  ["المكتب الاستشاري الهندسي المتحد", "United Engineering Consultants", 1, 0, 11, [0], 7500000, "ok"],
  ["شركة الحصن للأمن والسلامة", "Al-Hisn Security & Safety", 1, 4, 12, [10], 6000000, "ok"],
  ["شركة البريق للنظافة والخدمات العامة", "Bareeq Cleaning Services", 4, 5, 13, [10], 5200000, "ok"],
  ["شركة الطريق السريع للمركبات وقطع الغيار", "Highway Motors & Parts", 1, 2, 14, [6], 60000000, "ok"],
  ["شركة الكلمة للطباعة والقرطاسية", "Al-Kalima Printing", 4, 7, 15, [7], 5000000, "ok"],
  ["شركة الرمال الذهبية لمواد البناء", "Golden Sands Building Materials", 1, 1, 1, [0], 55000000, "ok"],
  ["شركة جسور للمقاولات", "Jusoor Contracting", 1, 10, 0, [1, 11], 75000000, "ok"],
  ["شركة الشبكة الذكية للاتصالات", "Smart Grid Telecom", 0, 1, 2, [8], 95000000, "ok"],
  ["شركة الحياة للمستلزمات الطبية", "Al-Hayat Medical Supplies", 1, 8, 3, [4], 9000000, "ok"],
  ["شركة السنابل للمواد الغذائية", "Sanabel Foods", 1, 3, 5, [], 70000000, "ok"],
  ["شركة القافلة للنقل البري", "Caravan Land Transport", 3, 6, 6, [], 8000000, "ok"],
  ["شركة الإعمار الحديث", "Modern Ieemar", 1, 2, 0, [1], 110000000, "cr-expired"],
  ["شركة البرمجيات المتقدمة", "Advanced Software Co.", 1, 0, 2, [], 28000000, "license-expired"],
  ["شركة الطاقة الخضراء", "Green Energy Co.", 1, 11, 8, [], 65000000, "pending"],
  ["شركة الدواء الآمن", "Safe Medicine Co.", 1, 1, 4, [3], 15000000, "activation-pending"],
  ["شركة البناء المتين", "Solid Build Co.", 2, 12, 0, [1], 10000000, "returned"],
  ["شركة الأمان للصيانة", "Al-Aman Maintenance", 4, 13, 10, [], 6200000, "expiring"],
  ["شركة المستقبل للتقنية", "Future Tech", 1, 2, 2, [7], 8500000, "incomplete"],
  ["شركة القمة للمقاولات والتوريدات", "Summit Contracting & Supply", 0, 0, 0, [1, 5, 7], 180000000, "suspended"],
];
const BANKS = ["مصرف الجمهورية", "المصرف التجاري الوطني", "مصرف الوحدة", "مصرف الصحاري", "مصرف شمال أفريقيا", "مصرف التجارة والتنمية"];
const PEOPLE = ["أحمد سالم", "محمد علي", "خالد عمر", "فاطمة يوسف", "سعاد إبراهيم", "عبدالله منصور", "مريم الهادي", "طارق مفتاح", "نوري عبدالسلام", "هدى رمضان"];

function buildSeed() {
  const t = todayIso();
  return SEED_ROWS.map((r, i) => {
    const [ar, en, form, cityIx, act, subs, capital, scenario] = r, n = i + 1, city = CITIES[cityIx], incYear = 2005 + (i * 7 % 17);
    const slug = en.split(" ")[0].toLowerCase().replace(/-/g, "") + n;
    const s = {
      id: n, code: `SUP-${String(n).padStart(4, "0")}`, nameAr: ar, nameEn: en, legalForm: LEGAL_FORMS[form], city,
      address: `${city} - شارع ${n % 2 === 0 ? "الجمهورية" : "عمر المختار"} - مبنى رقم ${10 + n}`,
      phone: `0${21 + cityIx}-${String(3000000 + n * 1371).padStart(7, "0")}`, email: `info@${slug}.ly`, website: `www.${slug}.ly`,
      contactPerson: PEOPLE[i % 10], contactPhone: `09${i % 2 === 0 ? 1 : 2}-${4000000 + n * 2711}`,
      mainActivity: ACTIVITIES[act], subActivities: subs.map(x => ACTIVITIES[x]).join(";"),
      commercialRegNo: `CR-${1000 + cityIx * 100}-${20000 + n * 37}`, commercialRegOffice: `مكتب السجل التجاري - ${city}`,
      commercialRegIssueDate: shift(t, { y: -1, d: -n * 9 }), commercialRegExpiryDate: shift(t, { y: 1, d: n * 11 % 300 }),
      chamberNo: `CH-${5000 + n * 13}`, taxNo: `TX-${700000 + n * 97}`,
      practiceLicenseNo: `PL-2024-${300 + n * 7}`, practiceLicenseAuthority: `مراقبة الاقتصاد - ${city}`,
      practiceLicenseIssueDate: shift(t, { m: -8, d: -n }), practiceLicenseExpiryDate: shift(t, { m: 16, d: n * 5 }),
      realEstateRegNo: `RE-${String(cityIx + 1).padStart(2, "0")}/${1500 + n * 23}`, realEstateOffice: `مصلحة التسجيل العقاري - ${city}`,
      realEstateRegDate: ymd(incYear + 1, 1 + n % 12, 1 + n % 27), premisesOwnership: n % 3 === 0 ? "إيجار" : "ملك",
      leaseExpiryDate: n % 3 === 0 ? shift(t, { m: 10 + n % 12 }) : null, propertyDescription: n % 4 === 0 ? "مقر إداري ومخزن" : "مقر إداري",
      incorporationContractNo: `INC-${incYear}-${100 + n}`, incorporationDate: ymd(incYear, 1 + (n * 5 % 12), 1 + n % 27),
      notaryOffice: `مكتب التوثيق - ${city}`, authorizedSignatory: PEOPLE[(i + 3) % 10],
      partners: `${PEOPLE[(i + 3) % 10]} | 60%\n${PEOPLE[(i + 5) % 10]} | 40%`,
      capital, paidUpCapital: Math.round(capital * (0.5 + (n % 6) * 0.1)), bankName: BANKS[i % BANKS.length],
      bankAccount: `LY${10 + n}0${n % 9}${100200300 + n * 11111}`,
      status: "Qualified", financialApproval: "Approved", financialApprovedBy: "المراجع المالي", financialApprovedAt: nowIso(-30 + n % 20), financialNotes: null,
      legalApproval: "Approved", legalApprovedBy: "المستشار القانوني", legalApprovedAt: nowIso(-28 + n % 20), legalNotes: null,
      activationApproval: "Approved", activationApprovedBy: "إدارة الفرع", activationApprovedAt: nowIso(-27 + n % 20), activationNotes: null,
      createdAt: nowIso(-60 + n), updatedAt: nowIso(-20 + n % 10),
    };
    const clearFin = () => { s.financialApproval = "Pending"; s.financialApprovedBy = null; s.financialApprovedAt = null; };
    const clearLeg = () => { s.legalApproval = "Pending"; s.legalApprovedBy = null; s.legalApprovedAt = null; };
    const clearAct = () => { s.activationApproval = "Pending"; s.activationApprovedBy = null; s.activationApprovedAt = null; };
    switch (scenario) {
      case "cr-expired": s.commercialRegExpiryDate = shift(t, { d: -25 }); break;
      case "license-expired": s.practiceLicenseExpiryDate = shift(t, { d: -40 }); break;
      case "pending": s.status = "PendingVerification"; clearFin(); clearLeg(); clearAct(); break;
      case "activation-pending": s.status = "PendingVerification"; clearAct(); break;
      case "returned": s.status = "Returned"; s.legalApproval = "Returned"; clearAct(); s.legalNotes = "سند المقر المرفق غير واضح - يرجى إرفاق نسخة مصدقة من السجل العقاري."; break;
      case "expiring": s.commercialRegExpiryDate = shift(t, { d: 18 }); s.practiceLicenseExpiryDate = shift(t, { d: 45 }); break;
      case "incomplete": s.status = "PendingVerification"; s.incorporationContractNo = null; s.realEstateRegNo = null; clearFin(); clearLeg(); clearAct(); break;
      case "suspended": s.status = "Suspended"; s.legalNotes = "إيقاف مؤقت لحين تسوية ملاحظات المراجعة الداخلية."; break;
    }
    return s;
  });
}

// ---------- التخزين ----------
let DB = null, FILES = {};
function persist() {
  try { localStorage.setItem(DB_KEY, JSON.stringify(DB)); } catch { }
}
function persistFiles() {
  try { localStorage.setItem(FILES_KEY, JSON.stringify(FILES)); return true; } catch { return false; }
}
async function initDb(force) {
  if (!force) {
    try { DB = JSON.parse(localStorage.getItem(DB_KEY) || "null"); FILES = JSON.parse(localStorage.getItem(FILES_KEY) || "{}"); } catch { DB = null; }
  }
  if (!DB || force) {
    const suppliers = buildSeed(), documents = [];
    const names = { CommercialRegistry: "commercial-registry", PracticeLicense: "practice-license", RealEstateRegistry: "real-estate-deed", IncorporationContract: "incorporation-contract", BankLetter: "bank-letter", TaxCertificate: "tax-certificate", SocialSecurityCertificate: "social-security", ChamberCertificate: "chamber-certificate" };
    suppliers.forEach(sp => Object.entries(names).forEach(([type, nm]) => {
      if (!sp.incorporationContractNo && (type === "RealEstateRegistry" || type === "IncorporationContract")) return;
      if (sp.code === "SUP-0025" && type === "TaxCertificate") return; // قيد المراجعة المالية ولم يُرفق شهادة السداد الضريبي
      if ((type === "SocialSecurityCertificate" || type === "ChamberCertificate") && sp.id % 3 !== 0) return;
      documents.push({ id: documents.length + 1, supplierId: sp.id, type, fileName: nm + ".pdf", contentType: "application/pdf", size: 620, uploadedAt: sp.createdAt, uploadedBy: "مسؤول المشتريات", stored: false, sample: true });
    }));
    const users = [];
    for (const [k, d] of DEMO_USERS.entries()) users.push({ id: k + 1, ...d, isActive: true, mustChangePassword: false, createdAt: nowIso(-90), lastLoginAt: null, ...(await hashPw(DEMO_PASSWORD)) });
    DB = { users, suppliers, documents, tenders: [], audit: [], settings: { id: 1, tierAMin: 100000000, tierBMin: 50000000, tierCMin: 5000000, maxTenderToCapitalRatio: 0.5, expiryWarningDays: 60 }, seq: { supplier: 30, doc: documents.length, tender: 0, audit: 0, user: users.length } };
    FILES = {}; persistFiles();
    await audit({ name: "النظام", role: "Admin" }, "Seed", "Supplier", null, "تهيئة قاعدة البيانات بـ 30 مورداً تجريبياً");
    persist();
  }
}

// ---------- سجل التدقيق ----------
async function sha256(text) {
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
  } catch {
    let h1 = 0x811c9dc5, out = ""; // بديل احتياطي إن لم تتوفر Web Crypto
    for (let k = 0; k < 8; k++) { for (const ch of text + k) { h1 ^= ch.charCodeAt(0); h1 = Math.imul(h1, 16777619) >>> 0; } out += h1.toString(16).padStart(8, "0"); }
    return out;
  }
}
const rawOf = l => `${l.prevHash}|${l.timestamp}|${l.user}|${l.role}|${l.action}|${l.entity}|${l.entityId ?? ""}|${l.details}`;
async function audit(u, action, entity, entityId, details) {
  const prevHash = DB.audit.length ? DB.audit[DB.audit.length - 1].hash : "0".repeat(64);
  const l = { id: ++DB.seq.audit, timestamp: new Date().toISOString(), user: u.name, role: u.role, action, entity, entityId, details, prevHash };
  l.hash = await sha256(rawOf(l));
  DB.audit.push(l);
}

// ---------- قواعد العمل ----------
const settings = () => DB.settings;
const classify = cap => cap >= settings().tierAMin ? "A" : cap >= settings().tierBMin ? "B" : cap >= settings().tierCMin ? "C" : "U";
const TIER_AR = { A: "فئة (أ)", B: "فئة (ب)", C: "فئة (ج)", U: "غير مصنف" };
// حسابات تجريبية: الدخول بالبريد الإلكتروني أو الرقم الوظيفي، وكلمة المرور الموحدة Demo@123
const DEMO_PASSWORD = "Demo@123";
const DEMO_USERS = [
  { employeeNo: "1001", email: "procurement@suppliers.demo", fullName: "أحمد سالم", role: "Procurement" },
  { employeeNo: "1002", email: "finance@suppliers.demo", fullName: "فاطمة يوسف", role: "Finance" },
  { employeeNo: "1003", email: "legal@suppliers.demo", fullName: "خالد عمر", role: "Legal" },
  { employeeNo: "1004", email: "branch@suppliers.demo", fullName: "مريم الهادي", role: "Management" },
  { employeeNo: "1000", email: "admin@suppliers.demo", fullName: "طارق مفتاح", role: "Admin" },
];
let LAST_ELIG = null;
// كلمات المرور تُحفظ مجزأة (SHA-256 مع ملح) وليست نصاً صريحاً
async function hashPw(pw, salt) { salt = salt || [...crypto.getRandomValues(new Uint8Array(12))].map(b => b.toString(16).padStart(2, "0")).join(""); return { salt, hash: await sha256(salt + "|" + pw) }; }
const checkPw = async (u, pw) => (await sha256(u.salt + "|" + pw)) === u.hash;
const tempPassword = () => { const c = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"; return "Tmp-" + [...crypto.getRandomValues(new Uint8Array(6))].map(b => c[b % c.length]).join(""); };
const pwPolicy = p => !p || p.length < 8 || !/\p{L}/u.test(p) || !/\d/.test(p) ? "كلمة المرور يجب أن تكون 8 أحرف على الأقل وتحتوي حرفاً ورقماً" : null;
const userDto = u => ({ id: u.id, employeeNo: u.employeeNo, email: u.email, fullName: u.fullName, role: u.role, isActive: u.isActive, mustChangePassword: u.mustChangePassword, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt });
function validateUser(i, id) {
  const e = {}, emp = String(i.employeeNo || "").trim(), email = String(i.email || "").trim().toLowerCase();
  if (!i.fullName || i.fullName.trim().length < 3) e.FullName = ["الاسم مطلوب (3 أحرف على الأقل)"];
  if (!/^\d{3,10}$/.test(emp)) e.EmployeeNo = ["الرقم الوظيفي أرقام فقط (من 3 إلى 10 خانات)"];
  else if (DB.users.some(x => x.id !== id && x.employeeNo === emp)) e.EmployeeNo = ["الرقم الوظيفي مستخدم لموظف آخر"];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.Email = ["البريد الإلكتروني غير صحيح"];
  else if (DB.users.some(x => x.id !== id && x.email.toLowerCase() === email)) e.Email = ["البريد مستخدم لموظف آخر"];
  if (!ROLES.includes(i.role)) e.Role = ["اختر الدور"];
  if (Object.keys(e).length) fail(400, "تحقق من البيانات", e);
  return { employeeNo: emp, email, fullName: i.fullName.trim(), role: i.role, isActive: i.isActive !== false };
}
const splitSubs = v => (v || "").split(";").map(x => x.trim()).filter(Boolean);
function missingCore(x) {
  const m = [];
  if (!x.commercialRegNo) m.push("السجل التجاري");
  if (!x.practiceLicenseNo) m.push("مزاولة النشاط");
  if (!x.realEstateRegNo) m.push("السجل العقاري");
  if (!(x.capital > 0)) m.push("رأس المال");
  if (!x.mainActivity) m.push("النشاط");
  return m;
}
function alertsOf(x) {
  const t = dnum(todayIso()), out = [];
  const check = (type, label, d) => {
    if (!d) return;
    const days = dnum(d) - t;
    if (days < 0) out.push({ type, label, date: d, days, severity: "danger" });
    else if (days <= settings().expiryWarningDays) out.push({ type, label, date: d, days, severity: "warning" });
  };
  check("CommercialRegistry", "السجل التجاري", x.commercialRegExpiryDate);
  check("PracticeLicense", "إذن مزاولة النشاط", x.practiceLicenseExpiryDate);
  check("Lease", "عقد إيجار المقر", x.leaseExpiryDate);
  return out;
}
function recompute(s) {
  if (s.status === "Suspended" || s.status === "Rejected") return;
  if (s.financialApproval === "Returned" || s.legalApproval === "Returned" || s.activationApproval === "Returned") s.status = "Returned";
  else if (s.financialApproval === "Approved" && s.legalApproval === "Approved" && s.activationApproval === "Approved" && !missingCore(s).length) s.status = "Qualified";
  else s.status = "PendingVerification";
}

function evaluate(q) {
  const t0 = performance.now(), st = settings();
  const value = Number(q.value), refDate = q.referenceDate || todayIso(), ratio = st.maxTenderToCapitalRatio;
  const requiredMinCapital = ratio > 0 ? Math.round(value / ratio * 100) / 100 : value;
  const includeSubs = q.includeSubActivities !== false;
  const out = [];
  for (const x of DB.suppliers) {
    const match = !q.activity || x.mainActivity === q.activity || (includeSubs && splitSubs(x.subActivities).includes(q.activity));
    if (!match) continue;
    const checks = [], miss = missingCore(x);
    checks.push({ code: "BR-01", title: "اكتمال البيانات والوثائق", passed: !miss.length, message: !miss.length ? "البيانات الأساسية مكتملة" : "ناقص: " + miss.join("، ") });
    const approved = x.financialApproval === "Approved" && x.legalApproval === "Approved" && x.activationApproval === "Approved" && x.status === "Qualified";
    checks.push({ code: "BR-02", title: "الاعتماد والتفعيل", passed: approved, message: approved ? "معتمد مالياً وقانونياً ومُفعّل من إدارة الفرع" : `الحالة: ${STATUS_AR[x.status]} · مالي: ${APPROVAL_AR[x.financialApproval]} · قانوني: ${APPROVAL_AR[x.legalApproval]} · التفعيل: ${APPROVAL_AR[x.activationApproval]}` });
    const crOk = !!x.commercialRegExpiryDate && x.commercialRegExpiryDate >= refDate;
    checks.push({ code: "LEG-1", title: "سريان السجل التجاري", passed: crOk, message: crOk ? `ساري حتى ${x.commercialRegExpiryDate}` : !x.commercialRegExpiryDate ? "تاريخ الانتهاء غير مدخل" : `منتهي منذ ${x.commercialRegExpiryDate}` });
    const licOk = !!x.practiceLicenseExpiryDate && x.practiceLicenseExpiryDate >= refDate;
    checks.push({ code: "LEG-2", title: "سريان إذن مزاولة النشاط", passed: licOk, message: licOk ? `ساري حتى ${x.practiceLicenseExpiryDate}` : !x.practiceLicenseExpiryDate ? "غير مدخل" : `منتهي منذ ${x.practiceLicenseExpiryDate}` });
    const tier = classify(x.capital), tierOk = tier !== "U";
    checks.push({ code: "BR-03", title: "التصنيف حسب رأس المال", passed: tierOk, message: tierOk ? `${TIER_AR[tier]} برأس مال ${N0(x.capital)} د.ل` : `رأس المال ${N0(x.capital)} د.ل أقل من الحد الأدنى للتصنيف ${N0(settings().tierCMin)} د.ل` });
    const maxValue = Math.round(x.capital * ratio * 100) / 100;
    const capOk = value <= maxValue;
    const util = x.capital > 0 ? Math.round(value / x.capital * 1000) / 10 : 999;
    checks.push({ code: "BR-04", title: "الملاءمة المالية مقابل قيمة المناقصة", passed: capOk, message: capOk ? `القيمة تمثل ${util}% من رأس المال (الحد ${Math.round(ratio * 100)}%)` : `القيمة تمثل ${util}% من رأس المال وتتجاوز الحد ${Math.round(ratio * 100)}% — العجز ${N0(value - maxValue)} د.ل` });
    if (q.activity) checks.push({ code: "ACT", title: "مطابقة النشاط", passed: true, message: x.mainActivity === q.activity ? "النشاط الرئيسي مطابق" : "مطابق عبر نشاط فرعي" });
    const eligible = checks.every(c => c.passed);
    // درجة الترتيب: الملاءمة المالية (40) + سريان الوثائق (25) + نسبة المدفوع (15) + مطابقة النشاط الرئيسي (20)
    let score = Math.min(Math.max(50 - util, 0), 50) * 0.8;
    const days = Math.min(...[x.commercialRegExpiryDate, x.practiceLicenseExpiryDate].map(d => d ? dnum(d) - dnum(refDate) : 0));
    score += Math.min(Math.max(days / 365 * 25, 0), 25);
    score += x.paidUpCapital > 0 && x.capital > 0 ? Math.min(15, x.paidUpCapital / x.capital * 15) : 0;
    score += (!q.activity || x.mainActivity === q.activity) ? 20 : 10;
    if (!eligible) score *= 0.5;
    out.push({ supplierId: x.id, code: x.code, name: x.nameAr, city: x.city, mainActivity: x.mainActivity, tier: classify(x.capital), capital: x.capital, maxTenderValue: maxValue, utilization: util, eligible, score: Math.round(Math.min(Math.max(score, 0), 100)), status: x.status, commercialRegExpiry: x.commercialRegExpiryDate, practiceLicenseExpiry: x.practiceLicenseExpiryDate, checks });
  }
  out.sort((a, b) => (b.eligible - a.eligible) || (b.score - a.score) || (b.capital - a.capital));
  const reasons = {};
  out.filter(c => !c.eligible).forEach(c => c.checks.filter(k => !k.passed).forEach(k => reasons[k.title] = (reasons[k.title] || 0) + 1));
  const reqTier = classify(requiredMinCapital);
  return LAST_ELIG = { value, activity: q.activity || null, referenceDate: refDate, ratio, requiredMinCapital, requiredTier: reqTier === "U" ? "C" : reqTier, total: out.length, eligibleCount: out.filter(c => c.eligible).length, excludedCount: out.filter(c => !c.eligible).length, exclusionReasons: reasons, candidates: out, elapsedMs: Math.max(1, Math.round(performance.now() - t0)) };
}

function validateInput(i) {
  const e = {}, add = (k, m) => (e[k] = e[k] || []).push(m);
  if (!i.nameAr || i.nameAr.trim().length < 3) add("NameAr", "اسم المورد مطلوب (3 أحرف على الأقل)");
  if (!i.legalForm) add("LegalForm", "الشكل القانوني مطلوب");
  if (!i.city) add("City", "المدينة مطلوبة");
  if (!ACTIVITIES.includes(i.mainActivity)) add("MainActivity", "اختر النشاط الرئيسي من القائمة");
  if ((i.subActivities || []).some(a => !ACTIVITIES.includes(a))) add("SubActivities", "نشاط فرعي غير معروف");
  if (i.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(i.email)) add("Email", "البريد الإلكتروني غير صحيح");
  if (!i.commercialRegNo || !String(i.commercialRegNo).trim()) add("CommercialRegNo", "رقم السجل التجاري مطلوب");
  if (i.commercialRegIssueDate && i.commercialRegExpiryDate && i.commercialRegIssueDate > i.commercialRegExpiryDate) add("CommercialRegExpiryDate", "تاريخ الانتهاء يجب أن يكون بعد تاريخ الإصدار");
  if (i.practiceLicenseIssueDate && i.practiceLicenseExpiryDate && i.practiceLicenseIssueDate > i.practiceLicenseExpiryDate) add("PracticeLicenseExpiryDate", "تاريخ الانتهاء يجب أن يكون بعد تاريخ الإصدار");
  if (i.incorporationDate && i.incorporationDate > todayIso()) add("IncorporationDate", "تاريخ التأسيس لا يمكن أن يكون مستقبلياً");
  if (!(Number(i.capital) > 0)) add("Capital", "رأس المال يجب أن يكون أكبر من صفر");
  if (i.paidUpCapital != null && (i.paidUpCapital < 0 || i.paidUpCapital > i.capital)) add("PaidUpCapital", "رأس المال المدفوع يجب أن يكون بين صفر ورأس المال المعلن");
  return e;
}
function applyInput(s, i) {
  const T = v => v == null || String(v).trim() === "" ? null : String(v).trim();
  const D = v => v ? String(v).slice(0, 10) : null;
  Object.assign(s, {
    nameAr: i.nameAr.trim(), nameEn: T(i.nameEn), legalForm: i.legalForm, city: i.city, address: T(i.address), phone: T(i.phone), email: T(i.email), website: T(i.website),
    contactPerson: T(i.contactPerson), contactPhone: T(i.contactPhone), mainActivity: i.mainActivity,
    subActivities: [...new Set((i.subActivities || []).filter(a => a !== i.mainActivity))].join(";"),
    commercialRegNo: String(i.commercialRegNo).trim(), commercialRegOffice: T(i.commercialRegOffice), commercialRegIssueDate: D(i.commercialRegIssueDate), commercialRegExpiryDate: D(i.commercialRegExpiryDate),
    chamberNo: T(i.chamberNo), taxNo: T(i.taxNo), practiceLicenseNo: T(i.practiceLicenseNo), practiceLicenseAuthority: T(i.practiceLicenseAuthority),
    practiceLicenseIssueDate: D(i.practiceLicenseIssueDate), practiceLicenseExpiryDate: D(i.practiceLicenseExpiryDate),
    realEstateRegNo: T(i.realEstateRegNo), realEstateOffice: T(i.realEstateOffice), realEstateRegDate: D(i.realEstateRegDate), premisesOwnership: T(i.premisesOwnership),
    leaseExpiryDate: i.premisesOwnership === "إيجار" ? D(i.leaseExpiryDate) : null, propertyDescription: T(i.propertyDescription),
    incorporationContractNo: T(i.incorporationContractNo), incorporationDate: D(i.incorporationDate), notaryOffice: T(i.notaryOffice), authorizedSignatory: T(i.authorizedSignatory), partners: T(i.partners),
    capital: Number(i.capital), paidUpCapital: i.paidUpCapital == null || i.paidUpCapital === "" ? null : Number(i.paidUpCapital), bankName: T(i.bankName), bankAccount: T(i.bankAccount),
  });
}
const snapshot = s => Object.fromEntries(INPUT_FIELDS.map(k => [k, s[k] == null ? "" : String(s[k])]));

// ---------- طبقة API ----------
function fail(status, title, errors) { const e = new Error(title); e.status = status; e.errors = errors || {}; throw e; }
const forbid = m => fail(403, m);
const can = (u, ...roles) => u.role === "Admin" || roles.includes(u.role);
const supplierById = id => DB.suppliers.find(s => s.id === id) || fail(404, "المورد غير موجود");

function summary(x) {
  const al = alertsOf(x);
  return { id: x.id, code: x.code, nameAr: x.nameAr, nameEn: x.nameEn, city: x.city, legalForm: x.legalForm, mainActivity: x.mainActivity, subActivities: splitSubs(x.subActivities), capital: x.capital, tier: classify(x.capital), status: x.status, financialApproval: x.financialApproval, legalApproval: x.legalApproval, activationApproval: x.activationApproval, commercialRegNo: x.commercialRegNo, commercialRegExpiryDate: x.commercialRegExpiryDate, practiceLicenseExpiryDate: x.practiceLicenseExpiryDate, missing: missingCore(x).length, alertLevel: al.some(a => a.severity === "danger") ? "danger" : al.length ? "warning" : "ok" };
}

const ROUTES = [
  ["GET", /^\/api\/auth\/demo-users$/, () => DEMO_USERS],
  ["POST", /^\/api\/auth\/login$/, async (u, m, i) => {
    const id = String(i?.identifier || "").trim();
    if (!id || !i?.password) fail(400, "أدخل البريد الإلكتروني أو الرقم الوظيفي وكلمة المرور");
    const f = DB.users.find(x => x.email.toLowerCase() === id.toLowerCase() || x.employeeNo === id);
    if (!f || !(await checkPw(f, i.password))) fail(401, "بيانات الدخول غير صحيحة. تحقق من البريد أو الرقم الوظيفي وكلمة المرور.");
    if (!f.isActive) fail(403, "هذا الحساب موقوف. تواصل مع مدير النظام.");
    f.lastLoginAt = nowIso();
    await audit({ name: f.fullName, role: f.role }, "Login", "User", f.id, `تسجيل دخول ${f.fullName} (الرقم الوظيفي ${f.employeeNo}) ${id.includes("@") ? "بالبريد الإلكتروني" : "بالرقم الوظيفي"}`);
    return { employeeNo: f.employeeNo, email: f.email, fullName: f.fullName, role: f.role, mustChangePassword: f.mustChangePassword };
  }],
  ["POST", /^\/api\/auth\/change-password$/, async (u, m, i) => {
    const f = DB.users.find(x => x.employeeNo === String(i?.employeeNo || ""));
    if (!f || !f.isActive || !(await checkPw(f, i.currentPassword || ""))) fail(400, "كلمة المرور الحالية غير صحيحة");
    const err = pwPolicy(i.newPassword); if (err) fail(400, err);
    if (i.newPassword === i.currentPassword) fail(400, "اختر كلمة مرور مختلفة عن الحالية");
    Object.assign(f, await hashPw(i.newPassword), { mustChangePassword: false });
    await audit({ name: f.fullName, role: f.role }, "ChangePassword", "User", f.id, `تغيير كلمة المرور للمستخدم ${f.fullName} (${f.employeeNo})`);
    return { ok: true };
  }],
  ["GET", /^\/api\/users$/, u => { if (u.role !== "Admin") forbid("إدارة المستخدمين من صلاحية مدير النظام"); return [...DB.users].sort((a, b) => a.employeeNo.localeCompare(b.employeeNo)).map(userDto); }],
  ["POST", /^\/api\/users$/, async (u, m, i) => {
    if (u.role !== "Admin") forbid("إدارة المستخدمين من صلاحية مدير النظام");
    const v = validateUser(i || {}, 0), temp = tempPassword();
    const nu = { id: ++DB.seq.user, ...v, mustChangePassword: true, createdAt: nowIso(), lastLoginAt: null, ...(await hashPw(temp)) };
    DB.users.push(nu);
    await audit(u, "CreateUser", "User", nu.id, `إضافة المستخدم ${nu.fullName} (${nu.employeeNo}) بدور ${nu.role}`);
    return { user: userDto(nu), temporaryPassword: temp };
  }],
  ["PUT", /^\/api\/users\/(\d+)$/, async (u, m, i) => {
    if (u.role !== "Admin") forbid("إدارة المستخدمين من صلاحية مدير النظام");
    const t = DB.users.find(x => x.id === +m[1]) || fail(404, "المستخدم غير موجود");
    const v = validateUser(i || {}, t.id);
    if (t.employeeNo === u.emp && (!v.isActive || v.role !== "Admin")) fail(400, "لا يمكنك إيقاف حسابك أو إزالة صلاحية مدير النظام عن نفسك");
    if (t.role === "Admin" && t.isActive && (!v.isActive || v.role !== "Admin") && DB.users.filter(x => x.role === "Admin" && x.isActive).length <= 1) fail(400, "يجب أن يبقى مدير نظام واحد نشط على الأقل");
    const ch = [];
    if (t.fullName !== v.fullName) ch.push(`الاسم: ${t.fullName} ← ${v.fullName}`);
    if (t.employeeNo !== v.employeeNo) ch.push(`الرقم الوظيفي: ${t.employeeNo} ← ${v.employeeNo}`);
    if (t.email !== v.email) ch.push(`البريد: ${t.email} ← ${v.email}`);
    if (t.role !== v.role) ch.push(`الدور: ${t.role} ← ${v.role}`);
    if (t.isActive !== v.isActive) ch.push(v.isActive ? "تفعيل الحساب" : "إيقاف الحساب");
    Object.assign(t, v);
    if (ch.length) await audit(u, "UpdateUser", "User", t.id, `تعديل المستخدم ${t.fullName}: ${ch.join("، ")}`);
    return userDto(t);
  }],
  ["POST", /^\/api\/users\/(\d+)\/reset-password$/, async (u, m) => {
    if (u.role !== "Admin") forbid("إدارة المستخدمين من صلاحية مدير النظام");
    const t = DB.users.find(x => x.id === +m[1]) || fail(404, "المستخدم غير موجود");
    const temp = tempPassword();
    Object.assign(t, await hashPw(temp), { mustChangePassword: true });
    await audit(u, "ResetPassword", "User", t.id, `إعادة تعيين كلمة المرور للمستخدم ${t.fullName} (${t.employeeNo})`);
    return { temporaryPassword: temp };
  }],
  ["GET", /^\/api\/meta$/, () => ({ activities: ACTIVITIES, legalForms: LEGAL_FORMS, cities: CITIES, roles: ROLES, settings: settings(), documentTypes: DOC_TYPE_NAMES })],

  ["GET", /^\/api\/suppliers$/, (u, m, b, q) => {
    let list = DB.suppliers;
    if (q.q) list = list.filter(x => x.nameAr.includes(q.q) || (x.nameEn || "").toLowerCase().includes(q.q.toLowerCase()) || x.code.includes(q.q) || x.commercialRegNo.includes(q.q));
    if (q.activity) list = list.filter(x => x.mainActivity === q.activity || (x.subActivities || "").includes(q.activity));
    if (q.status) list = list.filter(x => x.status === q.status);
    if (q.city) list = list.filter(x => x.city === q.city);
    let out = list.map(summary);
    if (q.tier) out = out.filter(x => x.tier === q.tier);
    return out.sort((a, b) => a.code.localeCompare(b.code));
  }],

  ["GET", /^\/api\/suppliers\/(\d+)$/, (u, m) => {
    const x = supplierById(+m[1]);
    const docs = DB.documents.filter(d => d.supplierId === x.id);
    return { supplier: { ...x, documents: docs }, tier: classify(x.capital), maxTenderValue: x.capital * settings().maxTenderToCapitalRatio, missing: missingCore(x),
      missingDocuments: CORE_DOC_TYPES.filter(t => !docs.some(d => d.type === t)), alerts: alertsOf(x), subActivities: splitSubs(x.subActivities) };
  }],

  ["POST", /^\/api\/suppliers$/, async (u, m, input) => {
    if (!can(u, "Procurement")) forbid("إضافة الموردين من صلاحية مسؤول المشتريات");
    const e = validateInput(input);
    if (DB.suppliers.some(x => x.commercialRegNo === String(input.commercialRegNo || "").trim())) e.CommercialRegNo = ["رقم السجل التجاري مسجل لمورد آخر"];
    if (Object.keys(e).length) fail(400, "يرجى تصحيح الحقول المحددة", e);
    const id = ++DB.seq.supplier;
    const s = { id, code: `SUP-${String(id).padStart(4, "0")}`, status: "PendingVerification", financialApproval: "Pending", legalApproval: "Pending", activationApproval: "Pending", createdAt: nowIso(), updatedAt: nowIso() };
    applyInput(s, input);
    DB.suppliers.push(s);
    await audit(u, "Create", "Supplier", id, `تسجيل المورد ${s.code} - ${s.nameAr} بحالة قيد المراجعة`);
    return { id, code: s.code };
  }],

  ["PUT", /^\/api\/suppliers\/(\d+)$/, async (u, m, input) => {
    if (!can(u, "Procurement")) forbid("تعديل بيانات الموردين من صلاحية مسؤول المشتريات");
    const s = supplierById(+m[1]);
    const e = validateInput(input);
    if (DB.suppliers.some(x => x.id !== s.id && x.commercialRegNo === String(input.commercialRegNo || "").trim())) e.CommercialRegNo = ["رقم السجل التجاري مسجل لمورد آخر"];
    if (Object.keys(e).length) fail(400, "يرجى تصحيح الحقول المحددة", e);
    const before = snapshot(s); applyInput(s, input); const after = snapshot(s);
    const changes = INPUT_FIELDS.filter(k => before[k] !== after[k]);
    if (!changes.length) return { id: s.id, changed: 0 };
    const fin = ["capital", "paidUpCapital", "bankName", "bankAccount"];
    const leg = ["commercialRegNo", "commercialRegExpiryDate", "practiceLicenseNo", "practiceLicenseExpiryDate", "realEstateRegNo", "incorporationContractNo", "partners", "mainActivity", "legalForm"];
    if (changes.some(c => fin.includes(c)) || s.financialApproval === "Returned") { s.financialApproval = "Pending"; s.financialApprovedBy = null; s.financialApprovedAt = null; }
    if (changes.some(c => leg.includes(c)) || s.legalApproval === "Returned") { s.legalApproval = "Pending"; s.legalApprovedBy = null; s.legalApprovedAt = null; }
    s.activationApproval = "Pending"; s.activationApprovedBy = null; s.activationApprovedAt = null;
    recompute(s); s.updatedAt = nowIso();
    await audit(u, "Update", "Supplier", s.id, `تعديل ${s.code}: ` + changes.map(c => `${c} [${before[c]} ← ${after[c]}]`).join("، "));
    return { id: s.id, changed: changes.length, status: s.status };
  }],

  ["POST", /^\/api\/suppliers\/(\d+)\/review$/, async (u, m, r) => {
    const s = supplierById(+m[1]), approve = r.decision === "approve";
    if (s.status === "Suspended" || s.status === "Rejected") fail(400, "المورد موقوف أو مرفوض؛ أعد تفعيله أولاً");
    if (!approve && !String(r.notes || "").trim()) fail(400, "سبب الإرجاع مطلوب", { Notes: ["سبب الإرجاع مطلوب"] });
    const state = approve ? "Approved" : "Returned";
    let stage;
    if (r.track === "financial") {
      if (!can(u, "Finance")) forbid("المراجعة المالية من صلاحية المراجع المالي");
      const fd = missingDocsOf(s, stageDocs("financial"));
      if (approve && fd.length) fail(400, "لا يمكن الاعتماد المالي قبل إرفاق: " + fd.map(t => DOC_AR[t]).join("، "));
      Object.assign(s, { financialApproval: state, financialApprovedBy: u.name, financialApprovedAt: nowIso(), financialNotes: r.notes || null }); stage = "المراجعة المالية";
    } else if (r.track === "legal") {
      if (!can(u, "Legal")) forbid("المراجعة القانونية من صلاحية المستشار القانوني");
      if (s.financialApproval !== "Approved") fail(400, "يجب اعتماد المراجعة المالية أولاً");
      const miss = missingCore(s);
      if (approve && miss.length) fail(400, "لا يمكن الاعتماد قبل استكمال: " + miss.join("، "));
      const ld = missingDocsOf(s, stageDocs("legal"));
      if (approve && ld.length) fail(400, "لا يمكن الاعتماد القانوني قبل إرفاق: " + ld.map(t => DOC_AR[t]).join("، "));
      Object.assign(s, { legalApproval: state, legalApprovedBy: u.name, legalApprovedAt: nowIso(), legalNotes: r.notes || null }); stage = "المراجعة القانونية";
    } else if (r.track === "activation") {
      if (!can(u, "Management")) forbid("اعتماد التفعيل من صلاحية إدارة الفرع");
      if (s.financialApproval !== "Approved" || s.legalApproval !== "Approved") fail(400, "يجب اكتمال المراجعتين المالية والقانونية قبل اعتماد التفعيل");
      const missDocs = missingDocsOf(s, CORE_DOC_TYPES);
      if (approve && missDocs.length) fail(400, "لا يمكن التفعيل قبل إرفاق المستندات اللازمة: " + missDocs.map(t => DOC_AR[t]).join("، "));
      Object.assign(s, { activationApproval: state, activationApprovedBy: u.name, activationApprovedAt: nowIso(), activationNotes: r.notes || null }); stage = "اعتماد التفعيل";
    } else fail(400, "مسار غير معروف");
    recompute(s); s.updatedAt = nowIso();
    await audit(u, approve ? "Approve" : "Return", "Supplier", s.id, `${stage}: ${approve ? "اعتماد" : "إرجاع للتصحيح"} ${s.code}${r.notes ? ` — ${r.notes}` : ""} ← الحالة: ${STATUS_AR[s.status]}`);
    return { status: s.status, financialApproval: s.financialApproval, legalApproval: s.legalApproval, activationApproval: s.activationApproval };
  }],

  ["POST", /^\/api\/suppliers\/(\d+)\/status$/, async (u, m, r) => {
    if (!can(u, "Legal", "Management")) forbid("إيقاف/رفض المورد من صلاحية الشؤون القانونية أو الإدارة");
    const s = supplierById(+m[1]), old = s.status;
    if ((r.status === "Suspended" || r.status === "Rejected") && !String(r.reason || "").trim()) fail(400, "السبب مطلوب", { Reason: ["السبب مطلوب"] });
    if (r.status === "Suspended" || r.status === "Rejected") { s.status = r.status; if (r.reason) s.legalNotes = r.reason; }
    else { s.status = "PendingVerification"; recompute(s); }
    s.updatedAt = nowIso();
    await audit(u, "StatusChange", "Supplier", s.id, `${s.code}: ${STATUS_AR[old]} ← ${STATUS_AR[s.status]}${r.reason ? ` — ${r.reason}` : ""}`);
    return { status: s.status };
  }],

  ["DELETE", /^\/api\/suppliers\/(\d+)$/, async (u, m) => {
    if (u.role !== "Admin") forbid("الحذف من صلاحية مدير النظام فقط");
    const s = supplierById(+m[1]);
    if (DB.tenders.some(t => t.invitations.some(i => i.supplierId === s.id))) fail(409, "لا يمكن حذف مورد مدرج في قوائم دعوات سابقة — استخدم الإيقاف بدلاً من ذلك");
    DB.documents.filter(d => d.supplierId === s.id).forEach(d => delete FILES[d.id]); persistFiles();
    DB.documents = DB.documents.filter(d => d.supplierId !== s.id);
    DB.suppliers = DB.suppliers.filter(x => x.id !== s.id);
    await audit(u, "Delete", "Supplier", s.id, `حذف المورد ${s.code} - ${s.nameAr}`);
    return null;
  }],

  ["POST", /^\/api\/suppliers\/(\d+)\/documents$/, async (u, m, fd) => {
    if (!can(u, "Procurement", "Legal", "Finance")) forbid("لا تملك صلاحية رفع الوثائق");
    const s = supplierById(+m[1]), file = fd.get("file"), type = fd.get("type");
    if (!file || !/\.(pdf|jpe?g|png)$/i.test(file.name)) fail(400, "الصيغ المسموحة: PDF, JPG, PNG");
    if (file.size > 10 * 1024 * 1024) fail(400, "الحجم الأقصى 10 ميغابايت");
    const doc = { id: ++DB.seq.doc, supplierId: s.id, type, fileName: file.name, contentType: file.type || "application/octet-stream", size: file.size, uploadedAt: nowIso(), uploadedBy: u.name, stored: false };
    if (file.size <= 1.5 * 1024 * 1024) {
      const dataUrl = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
      FILES[doc.id] = dataUrl; doc.stored = persistFiles();
      if (!doc.stored) delete FILES[doc.id];
    }
    DB.documents.push(doc);
    await audit(u, "Upload", "Supplier", s.id, `رفع وثيقة (${type}): ${doc.fileName}`);
    return doc;
  }],

  ["DELETE", /^\/api\/documents\/(\d+)$/, async (u, m) => {
    if (!can(u, "Procurement")) forbid("لا تملك صلاحية حذف الوثائق");
    const d = DB.documents.find(x => x.id === +m[1]) || fail(404, "الوثيقة غير موجودة");
    DB.documents = DB.documents.filter(x => x.id !== d.id); delete FILES[d.id]; persistFiles();
    await audit(u, "DeleteDocument", "Supplier", d.supplierId, `حذف وثيقة (${d.type}): ${d.fileName}`);
    return null;
  }],

  ["POST", /^\/api\/eligibility$/, (u, m, q) => {
    if (!(Number(q.value) > 0)) fail(400, "أدخل قيمة مناقصة أكبر من صفر");
    return evaluate(q);
  }],

  ["GET", /^\/api\/tenders$/, () => [...DB.tenders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(t => ({ id: t.id, refNo: t.refNo, title: t.title, activity: t.activity, value: t.value, closingDate: t.closingDate, createdAt: t.createdAt, createdBy: t.createdBy, invited: t.invitations.length }))],

  ["GET", /^\/api\/tenders\/(\d+)$/, (u, m) => {
    const t = DB.tenders.find(x => x.id === +m[1]) || fail(404, "المناقصة غير موجودة");
    return { ...t, invitations: t.invitations.map(i => { const s = DB.suppliers.find(x => x.id === i.supplierId) || {}; return { supplierId: i.supplierId, capitalUtilization: i.capitalUtilization, code: s.code, nameAr: s.nameAr || "(مورد محذوف)", city: s.city, capital: s.capital, phone: s.phone, email: s.email, contactPerson: s.contactPerson }; }).sort((a, b) => a.capitalUtilization - b.capitalUtilization) };
  }],

  ["POST", /^\/api\/tenders$/, async (u, m, i) => {
    if (!can(u, "Procurement")) forbid("إنشاء المناقصات من صلاحية مسؤول المشتريات");
    const e = {};
    if (!String(i.title || "").trim()) e.Title = ["عنوان المناقصة مطلوب"];
    if (!ACTIVITIES.includes(i.activity)) e.Activity = ["اختر النشاط"];
    if (!(Number(i.value) > 0)) e.Value = ["القيمة يجب أن تكون أكبر من صفر"];
    if (!i.closingDate || i.closingDate < todayIso()) e.ClosingDate = ["تاريخ الإقفال يجب أن يكون اليوم أو بعده"];
    if (Object.keys(e).length) fail(400, "يرجى تصحيح الحقول", e);
    // يُعاد تشغيل المحرك عند الحفظ: لا يمكن دعوة مورد غير مؤهل
    const r = evaluate({ value: i.value, activity: i.activity, referenceDate: i.closingDate });
    const elig = new Map(r.candidates.filter(c => c.eligible).map(c => [c.supplierId, c]));
    const chosen = i.supplierIds?.length ? [...new Set(i.supplierIds)] : [...elig.keys()];
    const bad = chosen.filter(id => !elig.has(id));
    if (bad.length) fail(400, `${bad.length} من الموردين المختارين غير مؤهلين لهذه المناقصة`);
    if (!chosen.length) fail(400, "لا يوجد موردون مؤهلون لهذه المناقصة");
    const id = ++DB.seq.tender;
    const t = { id, refNo: `TND-${new Date().getFullYear()}-${String(id).padStart(3, "0")}`, title: i.title.trim(), activity: i.activity, value: Number(i.value), closingDate: i.closingDate, description: i.description || null, createdAt: nowIso(), createdBy: u.name, invitations: chosen.map(sid => ({ supplierId: sid, capitalUtilization: elig.get(sid).utilization })) };
    DB.tenders.push(t);
    await audit(u, "CreateTender", "Tender", id, `إنشاء المناقصة ${t.refNo} «${t.title}» بقيمة ${N0(t.value)} د.ل وإصدار قائمة دعوات لـ ${chosen.length} مورد (من أصل ${elig.size} مؤهل)`);
    return { id, refNo: t.refNo };
  }],

  ["GET", /^\/api\/dashboard$/, () => {
    const all = DB.suppliers;
    const alerts = all.flatMap(x => alertsOf(x).map(a => ({ id: x.id, code: x.code, nameAr: x.nameAr, ...a }))).sort((a, b) => a.days - b.days);
    const groups = {};
    all.forEach(x => { const g = groups[x.mainActivity] ||= { activity: x.mainActivity, count: 0, qualified: 0 }; g.count++; if (x.status === "Qualified") g.qualified++; });
    return {
      total: all.length, qualified: all.filter(x => x.status === "Qualified").length, pending: all.filter(x => x.status === "PendingVerification").length,
      returned: all.filter(x => x.status === "Returned").length, suspended: all.filter(x => x.status === "Suspended" || x.status === "Rejected").length,
      completeness: all.length ? Math.round(all.filter(x => !missingCore(x).length).length * 1000 / all.length) / 10 : 0,
      totalCapital: all.reduce((a, x) => a + x.capital, 0),
      tiers: ["A", "B", "C", "U"].map(t => ({ tier: t, count: all.filter(x => classify(x.capital) === t).length })),
      byActivity: Object.values(groups).sort((a, b) => b.count - a.count),
      expired: alerts.filter(a => a.days < 0).length, expiringSoon: alerts.filter(a => a.days >= 0).length, alerts: alerts.slice(0, 15),
      tenders: DB.tenders.length, tendersValue: DB.tenders.reduce((a, t) => a + t.value, 0),
      pendingReview: all.filter(x => x.status === "PendingVerification" || x.status === "Returned").slice(0, 10).map(x => ({ id: x.id, code: x.code, nameAr: x.nameAr, financialApproval: x.financialApproval, legalApproval: x.legalApproval, activationApproval: x.activationApproval, status: x.status })),
      recent: DB.audit.slice(-8).reverse(),
    };
  }],

  ["GET", /^\/api\/audit$/, (u, m, b, q) => {
    let l = DB.audit;
    if (q.entity) l = l.filter(a => a.entity === q.entity);
    if (q.entityId) l = l.filter(a => a.entityId === +q.entityId);
    if (q.q) l = l.filter(a => a.details.includes(q.q) || a.user.includes(q.q));
    return l.slice().reverse().slice(0, Math.min(Math.max(+q.take || 200, 1), 1000));
  }],

  ["GET", /^\/api\/audit\/verify$/, async () => {
    let prev = "0".repeat(64), count = 0;
    for (const l of DB.audit) {
      count++;
      if (l.prevHash !== prev || await sha256(rawOf(l)) !== l.hash) return { ok: false, brokenAt: l.id, count };
      prev = l.hash;
    }
    return { ok: true, brokenAt: null, count };
  }],

  ["GET", /^\/api\/settings$/, () => settings()],
  ["PUT", /^\/api\/settings$/, async (u, m, i) => {
    if (u.role !== "Admin") forbid("تعديل المعايير من صلاحية مدير النظام");
    if (!(i.tierCMin > 0) || !(i.tierBMin > i.tierCMin) || !(i.tierAMin > i.tierBMin) || !(i.maxTenderToCapitalRatio > 0 && i.maxTenderToCapitalRatio <= 1) || !(i.expiryWarningDays >= 1 && i.expiryWarningDays <= 365))
      fail(400, "تحقق من القيم: حد الفئة (أ) أكبر من (ب)، وحد (ب) أكبر من (ج)، والنسبة بين 1% و100%، وأيام التنبيه بين 1 و365");
    const s = settings(), pc = v => Math.round(v * 100) + "%";
    const details = `الفئة أ ≥ ${N0(s.tierAMin)} ← ${N0(i.tierAMin)}، الفئة ب ≥ ${N0(s.tierBMin)} ← ${N0(i.tierBMin)}، الفئة ج ≥ ${N0(s.tierCMin)} ← ${N0(i.tierCMin)}، النسبة ${pc(s.maxTenderToCapitalRatio)} ← ${pc(i.maxTenderToCapitalRatio)}، التنبيه ${s.expiryWarningDays} ← ${i.expiryWarningDays} يوم`;
    Object.assign(s, { tierAMin: i.tierAMin, tierBMin: i.tierBMin, tierCMin: i.tierCMin, maxTenderToCapitalRatio: i.maxTenderToCapitalRatio, expiryWarningDays: i.expiryWarningDays });
    await audit(u, "UpdateSettings", "Settings", 1, details);
    return s;
  }],
];

/** نفس توقيع دالة api في نسخة الخادم: api(method, url, body, isForm) */
async function api(method, url, body) {
  if (!DB) await initDb();
  const [path, qs] = url.split("?");
  const q = Object.fromEntries(new URLSearchParams(qs || ""));
  const u = { name: user.name, role: user.role, emp: user.employeeNo };
  for (const [mth, re, fn] of ROUTES) {
    const m = path.match(re);
    if (mth === method && m) {
      const res = await fn(u, m, body, q);
      if (method !== "GET") persist();
      return res == null ? null : clone(res);
    }
  }
  fail(404, "المسار غير موجود");
}

// ---------- تصدير CSV ----------
const csvCell = v => (v == null ? "" : String(v)).replace(/[\t\n\r]+/g, " ");
function suppliersCsv() {
  const rows = [["الرمز", "الاسم", "الشكل القانوني", "المدينة", "النشاط الرئيسي", "رأس المال", "الفئة", "السجل التجاري", "انتهاء السجل", "مزاولة النشاط", "انتهاء المزاولة", "السجل العقاري", "عقد التأسيس", "الحالة"]];
  [...DB.suppliers].sort((a, b) => a.code.localeCompare(b.code)).forEach(x => rows.push([x.code, x.nameAr, x.legalForm, x.city, x.mainActivity, x.capital, classify(x.capital), x.commercialRegNo, x.commercialRegExpiryDate, x.practiceLicenseNo, x.practiceLicenseExpiryDate, x.realEstateRegNo, x.incorporationContractNo, STATUS_AR[x.status]]));
  return rows.map(r => r.map(csvCell).join("\t")).join("\n");
}
async function tenderCsv(id) {
  const t = await api("GET", `/api/tenders/${id}`);
  const rows = [["قائمة دعوات المناقصة", t.refNo, t.title], ["القيمة التقديرية", t.value, "تاريخ الإقفال", t.closingDate], [], ["م", "الرمز", "اسم المورد", "المدينة", "رأس المال", "نسبة الاستخدام %", "الهاتف", "البريد", "المسؤول"]];
  t.invitations.forEach((i, n) => rows.push([n + 1, i.code, i.nameAr, i.city, i.capital, i.capitalUtilization, i.phone, i.email, i.contactPerson]));
  return rows.map(r => r.map(csvCell).join("\t")).join("\n");
}
function tendersCsv() {
  const rows = [["الرقم المرجعي", "العنوان", "النشاط", "القيمة التقديرية (د.ل)", "تاريخ الإقفال", "عدد المدعوين", "أنشئت بواسطة"]];
  [...DB.tenders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).forEach(t => rows.push([t.refNo, t.title, t.activity, t.value, t.closingDate, t.invitations.length, t.createdBy]));
  return rows.map(r => r.map(csvCell).join("\t")).join("\n");
}


// ---------- جداول التصدير (Excel) ----------
function exportTable(kind, arg) {
  const today = new Date().toISOString().slice(0, 10), now = new Date().toLocaleString("en-GB");
  if (kind === "suppliers") {
    const list = [...DB.suppliers].sort((a, b) => a.code.localeCompare(b.code));
    return { file: `suppliers-${today}`, sheet: "الموردون", widths: [12, 38, 24, 12, 26, 16, 12, 18, 14, 14, 14, 16],
      title: "سجل الموردين", info: [`تاريخ التصدير: ${now}`, `عدد الموردين: ${list.length}`],
      header: ["الرمز", "الاسم", "الشكل القانوني", "المدينة", "النشاط الرئيسي", "رأس المال (د.ل)", "الفئة", "السجل التجاري", "انتهاء السجل", "مزاولة النشاط", "انتهاء المزاولة", "الحالة"],
      rows: list.map(x => [x.code, x.nameAr, x.legalForm, x.city, x.mainActivity, x.capital, TIER_AR[classify(x.capital)], x.commercialRegNo, x.commercialRegExpiryDate, x.practiceLicenseNo, x.practiceLicenseExpiryDate, STATUS_AR[x.status]]) };
  }
  if (kind === "tenders") {
    const list = [...DB.tenders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { file: `tenders-${today}`, sheet: "المناقصات", widths: [18, 40, 26, 18, 14, 12, 22],
      title: "سجل المناقصات وقوائم الدعوات", info: [`تاريخ التصدير: ${now}`, `عدد المناقصات: ${list.length}`],
      header: ["الرقم المرجعي", "العنوان", "النشاط", "القيمة التقديرية (د.ل)", "تاريخ الإقفال", "عدد المدعوين", "أنشئت بواسطة"],
      rows: list.map(t => [t.refNo, t.title, t.activity, t.value, t.closingDate, t.invitations.length, t.createdBy]) };
  }
  if (kind === "tender") {
    const t = DB.tenders.find(x => x.id === +arg); if (!t) return null;
    const inv = t.invitations.map(i => ({ i, s: DB.suppliers.find(x => x.id === i.supplierId) || {} })).sort((a, b) => a.i.capitalUtilization - b.i.capitalUtilization);
    return { file: `invitations-${t.refNo}`, sheet: "قائمة الدعوات", widths: [6, 12, 38, 14, 18, 14, 18, 30, 20],
      title: `قائمة الدعوات: ${t.title}`, info: [`الرقم المرجعي: ${t.refNo}`, `القيمة التقديرية: ${N0(t.value)} د.ل`, `تاريخ الإقفال: ${t.closingDate}`, `تاريخ التصدير: ${now}`],
      header: ["م", "الرمز", "المورد", "المدينة", "رأس المال (د.ل)", "نسبة الاستخدام %", "الهاتف", "البريد", "مسؤول التواصل"],
      rows: inv.map(({ i, s }, n) => [n + 1, s.code, s.nameAr || "(مورد محذوف)", s.city, s.capital, i.capitalUtilization, s.phone, s.email, s.contactPerson]),
      footer: [[], ["إعداد: مسؤول المشتريات", "", "التوقيع: ..........", "", "اعتماد: إدارة الفرع", "", "التوقيع: .........."]] };
  }
  if (kind === "elig") {
    const d = LAST_ELIG; if (!d) return null;
    return { file: `eligibility-${today}`, sheet: "نتيجة المطابقة", widths: [6, 12, 38, 14, 24, 12, 18, 18, 12, 10, 12, 60],
      title: "نتيجة مطابقة قيمة المناقصة", info: [`قيمة المناقصة: ${N0(d.value)} د.ل`, `النشاط: ${d.activity || "كل الأنشطة"}`, `حتى تاريخ: ${d.referenceDate}`, `الحد الأدنى لرأس المال: ${N0(d.requiredMinCapital)} د.ل`, `المؤهلون: ${d.eligibleCount} من ${d.total}`],
      header: ["م", "الرمز", "المورد", "المدينة", "النشاط الرئيسي", "الفئة", "رأس المال (د.ل)", "أقصى قيمة مناقصة (د.ل)", "نسبة الاستخدام %", "الدرجة", "النتيجة", "أسباب الاستبعاد"],
      rows: d.candidates.map((c, n) => [n + 1, c.code, c.name, c.city, c.mainActivity, TIER_AR[c.tier], c.capital, c.maxTenderValue, c.utilization, c.score, c.eligible ? "مؤهل" : "مستبعد", c.checks.filter(k => !k.passed).map(k => `${k.title}: ${k.message}`).join(" · ")]) };
  }
  return null;
}
const tableTsv = t => [[t.title], t.info, [], t.header, ...t.rows, ...(t.footer || [])].map(r => r.map(csvCell).join("\t")).join("\n");
