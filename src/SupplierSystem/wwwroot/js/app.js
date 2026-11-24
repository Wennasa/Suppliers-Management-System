/* منظومة إدارة وتأهيل الموردين — واجهة أمامية (Vanilla JS, بدون اعتماديات) */
"use strict";

// ============================================================ أدوات عامة
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const money = v => `<span class="num">${nf.format(Number(v || 0))}</span> د.ل`;
const moneyTxt = v => `${nf.format(Number(v || 0))} د.ل`;
const pct = v => `<span class="num">${Number(v).toLocaleString("en-US", { maximumFractionDigits: 1 })}%</span>`;
const fdate = d => d ? `<span class="num">${String(d).slice(0, 10)}</span>` : `<span class="muted">—</span>`;
const fdt = d => d ? new Date(d.endsWith("Z") ? d : d + "Z").toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }) : "—";
const today = () => new Date().toISOString().slice(0, 10);
const daysTo = d => d ? Math.round((new Date(d) - new Date(today())) / 86400000) : null;
const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

const STATUS = {
  PendingVerification: ["قيد المراجعة", "b-warn"], Qualified: ["نشط ومؤهل", "b-ok"], Returned: ["مُرجع للتصحيح", "b-danger"],
  Suspended: ["موقوف", "b-danger"], Rejected: ["مرفوض", "b-danger"]
};
const APPROVAL = { Pending: ["بانتظار", "b-warn"], Approved: ["معتمد", "b-ok"], Returned: ["مُرجع", "b-danger"] };
const TIER_NAME = { A: "فئة (أ) — كبرى", B: "فئة (ب) — متوسطة", C: "فئة (ج) — صغرى", U: "غير مصنف" };
const ROLE_NAME = { Procurement: "مسؤول المشتريات", Finance: "المراجع المالي", Legal: "المستشار القانوني", Management: "إدارة الفرع", Admin: "مدير النظام" };
/** دليل المستندات: [الاسم، الأيقونة، إلزامي؟، المجموعة، المرحلة التي تشترطه، وصف]. */
const DOC_TYPES = {
  CommercialRegistry: ["السجل التجاري", "📄", true, "legal", "legal", "ساري حتى تاريخ إقفال المناقصة"],
  PracticeLicense: ["إذن مزاولة النشاط", "🪪", true, "legal", "legal", "صادر من الجهة المختصة بالنشاط"],
  RealEstateRegistry: ["السجل العقاري / سند المقر", "🏢", true, "legal", "legal", "ملكية المقر أو عقد إيجاره"],
  IncorporationContract: ["عقد التأسيس والنظام الأساسي", "📜", false, "legal", null, "الشكل القانوني والشركاء"],
  TaxCertificate: ["شهادة السداد الضريبي", "🧾", true, "financial", "financial", "براءة ذمة سارية من مصلحة الضرائب"],
  BankLetter: ["الإفادة المصرفية برأس المال", "🏦", true, "financial", "financial", "تؤكد الحساب ورأس المال المودع"],
  SocialSecurityCertificate: ["شهادة الضمان الاجتماعي", "🛡", false, "financial", null, "براءة ذمة من صندوق الضمان"],
  AuditedFinancials: ["القوائم المالية المدققة", "📊", false, "financial", null, "ميزانية آخر سنة مالية"],
  ChamberCertificate: ["شهادة الغرفة التجارية", "🏛", false, "additional", null, "القيد في غرفة التجارة والصناعة"],
  SignatoryAuthorization: ["تفويض المفوض بالتوقيع", "✍", false, "additional", null, "مع إثبات هوية المفوض"],
  QualityCertificate: ["شهادات الجودة والخبرات", "🏅", false, "additional", null, "مثل ISO وشهادات إنجاز الأعمال"],
  ClassificationCertificate: ["شهادة التصنيف / الوكالة", "🏷", false, "additional", null, "تصنيف المقاولين أو الوكالة التجارية"],
  Other: ["وثائق أخرى", "📎", false, "additional", null, ""]
};
const DOC_GROUPS = { legal: "المستندات القانونية", financial: "المستندات المالية والضريبية", additional: "مستندات إضافية" };
const STAGE_NAME = { financial: "المراجعة المالية", legal: "المراجعة القانونية" };
const docsOfStage = st => Object.keys(DOC_TYPES).filter(k => DOC_TYPES[k][2] && DOC_TYPES[k][4] === st);
const docReqBadge = t => DOC_TYPES[t]?.[2] ? `<span class="badge b-info no-dot">إلزامي · قبل ${STAGE_NAME[DOC_TYPES[t][4]]}</span>` : `<span class="badge no-dot">اختياري</span>`;
const statusBadge = s => `<span class="badge ${STATUS[s]?.[1] || ""}">${STATUS[s]?.[0] || s}</span>`;
const approvalBadge = s => `<span class="badge ${APPROVAL[s]?.[1] || ""}">${APPROVAL[s]?.[0] || s}</span>`;
const tierBadge = (t, lg) => `<span class="tier tier-${t} ${lg ? "tier-lg" : ""}" title="${TIER_NAME[t]}">${{ A: "أ", B: "ب", C: "ج", U: "—" }[t]}</span>`;
/** التصنيف حسب رأس المال: أ ≥ 100 مليون، ب ≥ 50 مليون، ج ≥ 5 ملايين، وما دونه غير مصنف (الحدود من المعايير). */
const tierOf = (cap, st = state.meta.settings) => cap >= st.tierAMin ? "A" : cap >= st.tierBMin ? "B" : cap >= st.tierCMin ? "C" : "U";

function validityBadge(date, warnDays) {
  if (!date) return `<span class="badge">غير مدخل</span>`;
  const d = daysTo(date);
  if (d < 0) return `<span class="badge b-danger">منتهي منذ ${-d} يوم</span>`;
  if (d <= (warnDays ?? state.meta?.settings?.expiryWarningDays ?? 60)) return `<span class="badge b-warn">ينتهي خلال ${d} يوم</span>`;
  return `<span class="badge b-ok">ساري · ${d} يوم متبقٍ</span>`;
}

/** تحويل الرقم إلى وصف مقروء: 2,500,000 → "2.5 مليون دينار ليبي" */
function amountWords(v) {
  v = Number(v); if (!v) return "";
  const f = (n, d) => Number(n.toFixed(d)).toLocaleString("en-US");
  if (v >= 1e9) return `${f(v / 1e9, 2)} مليار دينار ليبي`;
  if (v >= 1e6) return `${f(v / 1e6, 2)} مليون دينار ليبي`;
  if (v >= 1e3) return `${f(v / 1e3, 1)} ألف دينار ليبي`;
  return `${v} دينار ليبي`;
}
const parseAmount = s => Number(String(s ?? "").replace(/[^\d.]/g, "")) || 0;
function bindAmount(input, onChange) {
  const fmt = () => {
    const raw = parseAmount(input.value);
    input.value = raw ? nf.format(raw) : "";
    onChange?.(raw);
  };
  input.addEventListener("input", () => {
    // نحول الأرقام العربية-الهندية إلى لاتينية قبل التنسيق
    input.value = input.value.replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
    fmt();
  });
  fmt();
}

// ============================================================ الحالة والمستخدم
const state = { meta: null, route: "" };
let session = (() => { try { return JSON.parse(sessionStorage.getItem("ss.session") || "null"); } catch { return null; } })();
const user = {
  get role() { return session?.role || "Procurement"; },
  get name() { return session?.fullName || ROLE_NAME[this.role]; },
  get employeeNo() { return session?.employeeNo || ""; },
  can(...roles) { return this.role === "Admin" || roles.includes(this.role); }
};
function setSession(s) { session = s; try { s ? sessionStorage.setItem("ss.session", JSON.stringify(s)) : sessionStorage.removeItem("ss.session"); } catch { } }

// ============================================================ API
async function api(method, url, body, isForm) {
  const headers = { "X-User": encodeURIComponent(user.name), "X-Role": user.role, "X-Emp": user.employeeNo };
  if (body && !isForm) headers["Content-Type"] = "application/json";
  const res = await fetch(url, { method, headers, body: isForm ? body : body ? JSON.stringify(body) : undefined });
  if (res.status === 204) return null;
  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("json") ? await res.json() : await res.text();
  if (!res.ok) {
    const err = new Error(data?.title || `خطأ ${res.status}`);
    err.status = res.status; err.errors = data?.errors || {};
    throw err;
  }
  return data;
}
const errText = e => [e.message, ...Object.values(e.errors || {}).flat()].filter((v, i, a) => v && a.indexOf(v) === i && v !== "One or more validation errors occurred.").join(" · ");

// ============================================================ مكونات الواجهة
function toast(msg, isErr) {
  const t = document.createElement("div");
  t.className = "toast" + (isErr ? " err" : "");
  t.textContent = msg;
  $("#toasts").appendChild(t);
  setTimeout(() => t.remove(), isErr ? 6000 : 3500);
}

function modal({ title, body, actions = [], wide }) {
  const root = $("#modalRoot");
  root.innerHTML = `<div class="modal-back"><div class="modal ${wide ? "wide" : ""}" role="dialog" aria-modal="true">
    <div class="modal-head"><h2>${title}</h2><button class="icon-btn" data-x aria-label="إغلاق">✕</button></div>
    <div class="modal-body">${body}</div>
    ${actions.length ? `<div class="modal-foot">${actions.map((a, i) => `<button class="btn ${a.cls || ""}" data-a="${i}">${a.label}</button>`).join("")}</div>` : ""}
  </div></div>`;
  const close = () => { root.innerHTML = ""; document.removeEventListener("keydown", onKey); };
  const onKey = e => e.key === "Escape" && close();
  document.addEventListener("keydown", onKey);
  $(".modal-back", root).addEventListener("mousedown", e => e.target.classList.contains("modal-back") && close());
  $("[data-x]", root).onclick = close;
  actions.forEach((a, i) => $(`[data-a="${i}"]`, root).onclick = async () => { if ((await a.onClick?.(root)) !== false) close(); });
  $("input,textarea,select", root)?.focus();
  return { root, close };
}

function crumbs(...parts) {
  $("#crumbs").innerHTML = parts.map((p, i) => i === parts.length - 1 ? `<b>${p}</b>` : p).join(" &nbsp;/&nbsp; ");
}

const view = () => $("#view");
const loading = () => view().innerHTML = `<div class="card card-pad stack"><div class="skeleton" style="width:30%"></div><div class="skeleton"></div><div class="skeleton" style="width:80%"></div></div>`;

// ============================================================ الموجه
const routes = [
  [/^#\/dashboard$/, renderDashboard, "dashboard"],
  [/^#\/match$/, renderMatch, "match"],
  [/^#\/suppliers$/, renderSuppliers, "suppliers"],
  [/^#\/suppliers\/new$/, () => renderWizard(null), "new"],
  [/^#\/suppliers\/(\d+)\/edit$/, m => renderWizard(+m[1]), "suppliers"],
  [/^#\/suppliers\/(\d+)$/, m => renderProfile(+m[1]), "suppliers"],
  [/^#\/tenders$/, renderTenders, "tenders"],
  [/^#\/tenders\/(\d+)$/, m => renderTender(+m[1]), "tenders"],
  [/^#\/audit$/, renderAudit, "audit"],
  [/^#\/settings$/, renderSettings, "settings"],
  [/^#\/users$/, renderUsers, "users"],
];

async function router() {
  const hash = location.hash || "#/match";
  if (!location.hash) { history.replaceState(null, "", "#/match"); }
  $("#sidebar").classList.remove("open");
  $("#modalRoot").innerHTML = "";
  for (const [re, fn, nav] of routes) {
    const m = hash.match(re);
    if (m) {
      $$(".nav a").forEach(a => a.classList.toggle("active", a.dataset.nav === nav));
      state.route = hash;
      loading();
      try { await fn(m); } catch (e) { console.error(e); view().innerHTML = `<div class="card card-pad callout danger">تعذر تحميل الصفحة: ${esc(errText(e))}</div>`; }
      window.scrollTo(0, 0);
      return;
    }
  }
  location.hash = "#/match";
}

// ============================================================ لوحة المؤشرات
async function renderDashboard() {
  crumbs("الرئيسية", "لوحة المؤشرات");
  const d = await api("GET", "/api/dashboard");
  const tierTotal = d.tiers.reduce((a, t) => a + t.count, 0) || 1;
  const maxAct = Math.max(...d.byActivity.map(a => a.count), 1);
  view().innerHTML = `
  <div class="page-head"><div><h1>لوحة المؤشرات</h1><p>نظرة شاملة على قاعدة الموردين وحالة التأهيل والتنبيهات.</p></div>
    <div class="row"><a class="btn" href="#/suppliers/new">＋ إضافة مورد</a><a class="btn btn-primary" href="#/match">⚖ مطابقة مناقصة</a></div></div>
  <div class="grid g4">
    <div class="card kpi accent"><div class="k-label">إجمالي الموردين</div><div class="k-value num">${d.total}</div><div class="k-sub">إجمالي رؤوس الأموال ${money(d.totalCapital)}</div></div>
    <div class="card kpi ok"><div class="k-label">نشط ومؤهل للترشيح</div><div class="k-value num">${d.qualified}</div><div class="k-sub">${pct(d.total ? d.qualified / d.total * 100 : 0)} من الإجمالي</div></div>
    <div class="card kpi warn"><div class="k-label">بانتظار التحقق / مُرجع</div><div class="k-value num">${d.pending + d.returned}</div><div class="k-sub">${d.pending} قيد التحقق · ${d.returned} مُرجع · ${d.suspended} موقوف</div></div>
    <div class="card kpi ${d.expired ? "danger" : "ok"}"><div class="k-label">وثائق منتهية / قاربت</div><div class="k-value num">${d.expired} / ${d.expiringSoon}</div><div class="k-sub">نسبة اكتمال الملفات ${pct(d.completeness)} (المستهدف ≥ 95%)</div></div>
  </div>

  <div class="grid g3" style="margin-top:16px">
    <div class="card"><div class="card-head"><h2>التصنيف حسب رأس المال</h2></div><div class="card-body">
      <div class="stackbar">${d.tiers.map(t => `<div class="tier-${t.tier}" style="width:${t.count / tierTotal * 100}%" title="${TIER_NAME[t.tier]}: ${t.count}"></div>`).join("")}</div>
      <div class="stack" style="margin-top:16px">${d.tiers.map(t => `<div class="row between"><div class="row">${tierBadge(t.tier)} <span>${TIER_NAME[t.tier]}</span></div><b class="num">${t.count}</b></div>`).join("")}</div>
      <div class="hint" style="margin-top:12px">أ ≥ ${moneyTxt(state.meta.settings.tierAMin)} · ب ≥ ${moneyTxt(state.meta.settings.tierBMin)} · ج ≥ ${moneyTxt(state.meta.settings.tierCMin)} · أقل من ذلك غير مصنف</div>
    </div></div>
    <div class="card span2"><div class="card-head"><h2>الموردون حسب النشاط</h2><div class="legend" style="margin:0"><span><i style="background:var(--ok)"></i>مؤهل</span><span><i style="background:var(--primary)"></i>غير مؤهل حالياً</span></div></div><div class="card-body">
      ${d.byActivity.map(a => `<div class="hbar"><span class="hb-label" title="${esc(a.activity)}">${esc(a.activity)}</span>
        <div class="hb-track"><div class="hb-fill q" style="width:${a.qualified / maxAct * 100}%"></div><div class="hb-fill" style="width:${(a.count - a.qualified) / maxAct * 100}%"></div></div>
        <span class="hb-val num">${a.count}</span></div>`).join("")}
    </div></div>
  </div>

  <div class="grid g2" style="margin-top:16px">
    <div class="card"><div class="card-head"><h2>تنبيهات انتهاء الصلاحية</h2><span class="badge b-danger">${d.expired} منتهي</span></div>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>المورد</th><th>الوثيقة</th><th>تاريخ الانتهاء</th><th>الحالة</th></tr></thead><tbody>
      ${d.alerts.length ? d.alerts.map(a => `<tr class="clickable" onclick="location.hash='#/suppliers/${a.id}'"><td class="name">${esc(a.nameAr)}<div class="muted small num">${a.code}</div></td><td>${a.label}</td><td>${fdate(a.date)}</td><td>${validityBadge(a.date)}</td></tr>`).join("") : `<tr><td colspan="4" class="empty">لا توجد تنبيهات ✓</td></tr>`}
      </tbody></table></div></div>
    <div class="card"><div class="card-head"><h2>ملفات في سير المراجعة والاعتماد</h2></div>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>المورد</th><th>المالي</th><th>القانوني</th><th>التفعيل</th></tr></thead><tbody>
      ${d.pendingReview.length ? d.pendingReview.map(p => `<tr class="clickable" onclick="location.hash='#/suppliers/${p.id}'"><td class="name">${esc(p.nameAr)}<div class="muted small num">${p.code}</div></td><td>${approvalBadge(p.financialApproval)}</td><td>${approvalBadge(p.legalApproval)}</td><td>${approvalBadge(p.activationApproval)}</td></tr>`).join("") : `<tr><td colspan="4" class="empty">لا توجد ملفات معلقة</td></tr>`}
      </tbody></table></div></div>
  </div>

  <div class="card" style="margin-top:16px"><div class="card-head"><h2>آخر العمليات</h2><a href="#/audit" class="btn btn-sm">سجل التدقيق الكامل</a></div>
    <div class="card-body"><div class="timeline">${d.recent.map(a => `<div class="tl-item"><div>${esc(a.details)}</div><div class="tl-meta">${esc(a.user)} · ${ROLE_NAME[a.role] || a.role} · <span class="num">${fdt(a.timestamp)}</span></div></div>`).join("")}</div></div></div>`;
}

// ============================================================ مطابقة قيمة المناقصة (الشاشة المحورية)
async function renderMatch() {
  crumbs("الترشيح", "مطابقة قيمة المناقصة");
  const s = state.meta.settings;
  const saved = (() => { try { return JSON.parse(sessionStorage.getItem("ss.match") || "{}"); } catch { return {}; } })();
  const m = { value: saved.value || 0, activity: saved.activity || "", date: saved.date || "", subs: saved.subs ?? true, tab: "eligible", selected: new Set(), compare: new Set(), open: new Set(), data: null };

  view().innerHTML = `
  <section class="match-hero no-print">
    <h1>⚖ مطابقة قيمة المناقصة مع الموردين المؤهلين</h1>
    <p>أدخل القيمة التقديرية للمناقصة والنشاط المطلوب؛ يطبق المحرك قواعد الأهلية (BR-01 → BR-04) لحظياً ويعرض المرشحين وأسباب الاستبعاد.</p>
    <div class="match-form">
      <div>
        <label class="lbl" for="mValue">القيمة التقديرية للمناقصة (د.ل)</label>
        <input id="mValue" class="input value-input" inputmode="numeric" autocomplete="off" placeholder="0" value="${m.value || ""}">
        <div class="words" id="mWords"></div>
        <div class="quick">${[1000000, 2500000, 5000000, 10000000, 25000000, 50000000].map(v => `<button type="button" data-v="${v}">${amountWords(v).replace(" دينار ليبي", "")}</button>`).join("")}</div>
      </div>
      <div>
        <label class="lbl" for="mAct">النشاط المطلوب</label>
        <select id="mAct" class="select"><option value="">— كل الأنشطة —</option>${state.meta.activities.map(a => `<option ${a === m.activity ? "selected" : ""}>${esc(a)}</option>`).join("")}</select>
        <label class="switch"><input type="checkbox" id="mSubs" ${m.subs ? "checked" : ""}> تضمين الموردين ذوي النشاط الفرعي المطابق</label>
      </div>
      <div>
        <label class="lbl" for="mDate">تاريخ إقفال المناقصة</label>
        <input id="mDate" type="date" class="input" style="height:46px" min="${today()}" value="${m.date}">
        <div class="hint">يُتحقق من سريان السجل التجاري ومزاولة النشاط حتى هذا التاريخ (الافتراضي: اليوم).</div>
      </div>
    </div>
  </section>
  <div id="mResult"></div>`;

  const input = $("#mValue");
  const run = debounce(evaluate, 250);
  bindAmount(input, v => { m.value = v; $("#mWords").textContent = amountWords(v); run(); });
  $$(".quick button").forEach(b => b.onclick = () => { input.value = b.dataset.v; input.dispatchEvent(new Event("input")); });
  $("#mAct").onchange = e => { m.activity = e.target.value; evaluate(); };
  $("#mSubs").onchange = e => { m.subs = e.target.checked; evaluate(); };
  $("#mDate").onchange = e => { m.date = e.target.value; evaluate(); };
  if (!m.value) input.focus();

  async function evaluate() {
    try { sessionStorage.setItem("ss.match", JSON.stringify({ value: m.value, activity: m.activity, date: m.date, subs: m.subs })); } catch { }
    const box = $("#mResult");
    if (!box) return;
    if (!m.value) {
      box.innerHTML = `<div class="card card-pad empty" style="margin-top:18px"><div style="font-size:40px">💡</div><h2>ابدأ بإدخال قيمة المناقصة</h2>
        <p class="muted">يشترط النظام ألا تتجاوز قيمة المناقصة <b>${pct(s.maxTenderToCapitalRatio * 100)}</b> من رأس مال المورد، أي أن الحد الأدنى لرأس المال = القيمة ÷ ${s.maxTenderToCapitalRatio}.</p></div>`;
      return;
    }
    try {
      m.data = await api("POST", "/api/eligibility", { value: m.value, activity: m.activity || null, referenceDate: m.date || null, includeSubActivities: m.subs });
      m.selected = new Set(m.data.candidates.filter(c => c.eligible).map(c => c.supplierId));
      m.compare = new Set([...m.compare].filter(id => m.selected.has(id)));
      draw();
    } catch (e) { box.innerHTML = `<div class="callout danger" style="margin-top:18px">${esc(errText(e))}</div>`; }
  }

  function draw() {
    const d = m.data, box = $("#mResult");
    const elig = d.candidates.filter(c => c.eligible), excl = d.candidates.filter(c => !c.eligible);
    const list = m.tab === "eligible" ? elig : m.tab === "excluded" ? excl : d.candidates;
    const reasons = Object.entries(d.exclusionReasons).sort((a, b) => b[1] - a[1]);

    const xq = new URLSearchParams({ value: d.value, activity: d.activity || "", date: String(d.referenceDate).slice(0, 10), subs: m.subs });
    box.innerHTML = `
    <div class="print-only print-head"><h1>نتيجة مطابقة قيمة المناقصة</h1><div>القيمة ${moneyTxt(d.value)} · ${d.activity ? esc(d.activity) : "كل الأنشطة"} · حتى <span class="num">${String(d.referenceDate).slice(0, 10)}</span></div><div class="small">منظومة إدارة وتأهيل الموردين · تاريخ الطباعة <span class="num">${today()}</span></div></div>
    <div class="row no-print export-bar"><span class="muted small">تصدير النتيجة كاملة (المؤهلون والمستبعدون مع الأسباب):</span><a class="btn btn-sm" href="/api/eligibility/export.xlsx?${xq}">⬇ Excel</a><button class="btn btn-sm" onclick="printPdf()">📄 PDF</button></div>
    <table class="print-only print-tbl"><thead><tr><th>م</th><th>الرمز</th><th>المورد</th><th>المدينة</th><th>الفئة</th><th>رأس المال (د.ل)</th><th>نسبة الاستخدام</th><th>النتيجة</th><th>سبب الاستبعاد</th></tr></thead><tbody>
      ${d.candidates.map((c, n) => `<tr><td>${n + 1}</td><td class="nw">${c.code}</td><td>${esc(c.name)}</td><td>${esc(c.city)}</td><td class="nw">${TIER_NAME[c.tier].split(" —")[0]}</td><td class="nw">${nf.format(c.capital)}</td><td>${c.utilization}%</td><td>${c.eligible ? "مؤهل" : "مستبعد"}</td><td>${esc(c.checks.filter(k => !k.passed).map(k => k.title).join("، "))}</td></tr>`).join("")}
    </tbody></table>
    <div class="print-only sign-row"><div>إعداد: مسؤول المشتريات<br><br>التوقيع: ..................</div><div>اعتماد: إدارة الفرع<br><br>التوقيع: ..................</div></div>
    <div class="summary no-print">
      <div class="card"><div class="s-label">قيمة المناقصة</div><div class="s-value">${money(d.value)}</div></div>
      <div class="card"><div class="s-label">الحد الأدنى لرأس المال المطلوب</div><div class="s-value">${money(d.requiredMinCapital)}</div></div>
      <div class="card"><div class="s-label">الفئة الدنيا المكافئة</div><div class="s-value row">${tierBadge(d.requiredTier)} <span style="font-size:15px">${TIER_NAME[d.requiredTier]}</span></div></div>
      <div class="card" style="border-top:3px solid var(--ok)"><div class="s-label">موردون مؤهلون</div><div class="s-value num" style="color:var(--ok)">${d.eligibleCount} <span class="muted small">من ${d.total}</span></div></div>
      <div class="card" style="border-top:3px solid var(--danger)"><div class="s-label">مستبعدون</div><div class="s-value num" style="color:var(--danger)">${d.excludedCount}</div></div>
    </div>
    <div class="rule-box no-print"><b>قاعدة BR-04:</b> قيمة المناقصة ≤ ${pct(d.ratio * 100)} من رأس المال
      ${reasons.length ? `<span class="muted">·</span> <b>أسباب الاستبعاد:</b> ${reasons.map(([r, c]) => `<span class="reason">${esc(r)} (${c})</span>`).join(" ")}` : ""}
      <span class="muted small" style="margin-inline-start:auto">زمن المعالجة: <span class="num">${d.elapsedMs}ms</span> · ${d.activity ? esc(d.activity) : "كل الأنشطة"} · حتى ${fdate(d.referenceDate)}</span></div>

    <div class="card no-print" style="margin-top:16px">
      <div class="tabs">
        <button class="tab ${m.tab === "eligible" ? "on" : ""}" data-tab="eligible">المؤهلون<span class="cnt num">${elig.length}</span></button>
        <button class="tab ${m.tab === "excluded" ? "on" : ""}" data-tab="excluded">المستبعدون وأسباب الاستبعاد<span class="cnt num">${excl.length}</span></button>
        <button class="tab ${m.tab === "all" ? "on" : ""}" data-tab="all">الكل<span class="cnt num">${d.candidates.length}</span></button>
        <button class="tab ${m.tab === "map" ? "on" : ""}" data-tab="map">خريطة الملاءمة المالية</button>
      </div>
      ${m.tab === "map" ? capacityMap(d) : list.length ? list.map(candRow).join("") : `<div class="empty">${m.tab === "eligible" ? "لا يوجد موردون مؤهلون لهذه القيمة والنشاط — راجع تبويب المستبعدين لمعرفة الأسباب." : "لا يوجد مستبعدون."}</div>`}
      ${elig.length ? `<div class="sticky-actions">
        <div class="row"><b class="num">${m.selected.size}</b> مورد محدد لقائمة الدعوات
          <button class="btn btn-sm btn-ghost" id="selAll">تحديد الكل</button><button class="btn btn-sm btn-ghost" id="selNone">إلغاء التحديد</button></div>
        <div class="row">
          <button class="btn" id="cmpBtn" ${m.compare.size < 2 ? "disabled" : ""}>⇄ مقارنة (${m.compare.size}/4)</button>
          <button class="btn btn-primary" id="tenderBtn" ${m.selected.size ? "" : "disabled"}>✉ إنشاء مناقصة وإصدار قائمة الدعوات</button>
        </div></div>` : ""}
    </div>`;

    $$(".tab", box).forEach(t => t.onclick = () => { m.tab = t.dataset.tab; draw(); });
    $$("[data-sel]", box).forEach(c => c.onchange = () => { const id = +c.dataset.sel; c.checked ? m.selected.add(id) : m.selected.delete(id); draw(); });
    $$("[data-cmp]", box).forEach(c => c.onclick = () => {
      const id = +c.dataset.cmp;
      if (m.compare.has(id)) m.compare.delete(id); else if (m.compare.size < 4) m.compare.add(id); else return toast("يمكن مقارنة 4 موردين كحد أقصى", true);
      draw();
    });
    $$("[data-open]", box).forEach(c => c.onclick = () => { const id = +c.dataset.open; m.open.has(id) ? m.open.delete(id) : m.open.add(id); draw(); });
    $("#selAll", box) && ($("#selAll", box).onclick = () => { elig.forEach(c => m.selected.add(c.supplierId)); draw(); });
    $("#selNone", box) && ($("#selNone", box).onclick = () => { m.selected.clear(); draw(); });
    $("#cmpBtn", box) && ($("#cmpBtn", box).onclick = () => showCompare(d.candidates.filter(c => m.compare.has(c.supplierId)), d));
    $("#tenderBtn", box) && ($("#tenderBtn", box).onclick = () => createTenderDialog(m));
  }

  function candRow(c) {
    const util = Number(c.utilization), lim = m.data.ratio * 100;
    const scale = Math.max(100, Math.min(util, 300));
    const cls = util > lim ? "over" : util > lim * .8 ? "warn" : "";
    const failed = c.checks.filter(k => !k.passed);
    const ringColor = c.eligible ? (c.score >= 70 ? "var(--ok)" : "#e2a336") : "var(--danger)";
    return `<div class="cand ${c.eligible ? "" : "excluded"}">
      <div>${c.eligible ? `<input type="checkbox" data-sel="${c.supplierId}" ${m.selected.has(c.supplierId) ? "checked" : ""} title="ضمن قائمة الدعوات">` : `<span title="مستبعد" style="color:var(--danger);font-size:18px">⊘</span>`}</div>
      <div>${tierBadge(c.tier)}</div>
      <div><a class="c-name" href="#/suppliers/${c.supplierId}">${esc(c.name)}</a>
        <div class="muted small"><span class="num">${c.code}</span> · ${esc(c.city)} · ${esc(c.mainActivity)}</div>
        ${failed.length ? `<div class="reasons">${failed.map(k => `<span class="reason" title="${esc(k.message)}">${esc(k.title)}</span>`).join("")}</div>` : ""}
      </div>
      <div class="c-gauge">
        <div class="row between small"><span>رأس المال ${money(c.capital)}</span><span>الحد الأقصى للمناقصة ${money(c.maxTenderValue)}</span></div>
        <div class="gauge" title="نسبة قيمة المناقصة من رأس المال"><div class="g-fill ${cls}" style="width:${Math.min(util / scale * 100, 100)}%"></div><div class="g-limit" style="inset-inline-start:${lim / scale * 100}%"></div></div>
        <div class="gauge-cap"><span>الاستخدام ${pct(util)}</span><span>الحد ${pct(lim)}</span></div>
      </div>
      <div class="score"><div class="s-ring" style="border:3px solid ${ringColor};color:${ringColor}">${c.score}</div><span class="small muted">درجة<br>الترتيب</span></div>
      <div class="row" style="justify-content:flex-end;gap:4px">
        ${c.eligible ? `<button class="btn btn-sm ${m.compare.has(c.supplierId) ? "btn-primary" : ""}" data-cmp="${c.supplierId}" title="إضافة للمقارنة">⇄</button>` : ""}
        <button class="btn btn-sm" data-open="${c.supplierId}">${m.open.has(c.supplierId) ? "▲" : "▼"} القواعد</button>
      </div>
    </div>
    ${m.open.has(c.supplierId) ? `<div class="checks">${c.checks.map(k => `<div class="check"><span class="ci ${k.passed ? "ok" : "no"}">${k.passed ? "✓" : "✕"}</span><div><b>${esc(k.code)} · ${esc(k.title)}</b><div class="muted">${esc(k.message)}</div></div></div>`).join("")}</div>` : ""}`;
  }

  function capacityMap(d) {
    const rows = [...d.candidates].sort((a, b) => b.maxTenderValue - a.maxTenderValue);
    const max = Math.max(d.value * 1.15, ...rows.map(r => r.maxTenderValue)) || 1;
    return `<div class="capmap">
      <p class="muted small" style="margin-top:0">يمثل كل شريط الحد الأقصى لقيمة المناقصة التي يستطيع المورد التقدم لها (رأس المال × ${pct(d.ratio * 100)}). الخط الأحمر هو قيمة المناقصة الحالية؛ الأشرطة الخضراء لموردين مؤهلين.</p>
      ${rows.map(r => `<div class="cm-row"><a href="#/suppliers/${r.supplierId}" class="nowrap" style="overflow:hidden;text-overflow:ellipsis">${esc(r.name)}</a>
        <div class="cm-track"><div class="cm-bar ${r.eligible ? "ok" : ""}" style="width:${r.maxTenderValue / max * 100}%"></div>
          <div class="cm-line" style="inset-inline-start:${d.value / max * 100}%"></div></div>
        <span class="small num">${nf.format(r.maxTenderValue)}</span></div>`).join("")}
      <div class="cm-row"><span></span><div style="position:relative;height:14px"><span class="small" style="position:absolute;inset-inline-start:${d.value / max * 100}%;transform:translateX(50%);color:var(--danger);font-weight:600;white-space:nowrap">▲ قيمة المناقصة ${moneyTxt(d.value)}</span></div><span></span></div>
    </div>`;
  }
  evaluate();
}

function showCompare(list, d) {
  const best = (fn, hi = true) => { const vals = list.map(fn); const b = hi ? Math.max(...vals) : Math.min(...vals); return v => v === b; };
  const rows = [
    ["الفئة", c => `${tierBadge(c.tier)} ${TIER_NAME[c.tier]}`],
    ["المدينة", c => esc(c.city)],
    ["النشاط الرئيسي", c => esc(c.mainActivity)],
    ["رأس المال", c => money(c.capital), c => c.capital],
    ["الحد الأقصى للمناقصة", c => money(c.maxTenderValue), c => c.maxTenderValue],
    ["نسبة الاستخدام", c => pct(c.utilization), c => -c.utilization],
    ["الهامش المتبقي", c => money(c.maxTenderValue - d.value), c => c.maxTenderValue - d.value],
    ["انتهاء السجل التجاري", c => `${fdate(c.commercialRegExpiry)}<div>${validityBadge(c.commercialRegExpiry)}</div>`, c => daysTo(c.commercialRegExpiry)],
    ["انتهاء مزاولة النشاط", c => `${fdate(c.practiceLicenseExpiry)}<div>${validityBadge(c.practiceLicenseExpiry)}</div>`, c => daysTo(c.practiceLicenseExpiry)],
    ["درجة الترتيب", c => `<b class="num">${c.score}</b> / 100`, c => c.score],
  ];
  modal({
    title: `مقارنة الموردين لمناقصة بقيمة ${moneyTxt(d.value)}`, wide: true,
    body: `<div class="table-wrap"><table class="compare-table"><thead><tr><th></th>${list.map(c => `<td><a href="#/suppliers/${c.supplierId}"><b>${esc(c.name)}</b></a><div class="muted small num">${c.code}</div></td>`).join("")}</tr></thead>
      <tbody>${rows.map(([label, fn, key]) => { const isBest = key ? best(key) : () => false; return `<tr><th>${label}</th>${list.map(c => `<td class="${key && list.length > 1 && isBest(key(c)) ? "best" : ""}">${fn(c)}</td>`).join("")}</tr>`; }).join("")}</tbody></table></div>
      <p class="hint">الخلايا المظللة بالأخضر تمثل الأفضل في كل معيار.</p>`,
    actions: [{ label: "إغلاق" }]
  });
}

function createTenderDialog(m) {
  if (!user.can("Procurement")) return toast("إنشاء المناقصات من صلاحية مسؤول المشتريات — غيّر الدور من الأعلى", true);
  if (!m.activity) return toast("حدد النشاط المطلوب قبل إنشاء المناقصة", true);
  modal({
    title: "إنشاء مناقصة وإصدار قائمة الدعوات",
    body: `<div class="stack">
      <div class="callout info">سيتم دعوة <b class="num">${m.selected.size}</b> مورد مؤهل لمناقصة بقيمة <b>${moneyTxt(m.value)}</b> في نشاط «${esc(m.activity)}». يعيد النظام التحقق من الأهلية عند الحفظ.</div>
      <div><label class="lbl">عنوان المناقصة <span class="req">*</span></label><input class="input" id="tTitle" placeholder="مثال: توريد وتركيب منظومة كاميرات مراقبة للمقر الرئيسي"></div>
      <div><label class="lbl">تاريخ الإقفال <span class="req">*</span></label><input class="input" id="tDate" type="date" min="${today()}" value="${m.date || new Date(Date.now() + 21 * 864e5).toISOString().slice(0, 10)}"></div>
      <div><label class="lbl">الوصف / نطاق العمل</label><textarea class="input" id="tDesc" rows="3"></textarea></div>
      <div class="field-err" id="tErr"></div></div>`,
    actions: [{ label: "إلغاء" }, {
      label: "✉ إنشاء وإصدار القائمة", cls: "btn-primary", onClick: async root => {
        try {
          const r = await api("POST", "/api/tenders", { title: $("#tTitle", root).value, activity: m.activity, value: m.value, closingDate: $("#tDate", root).value, description: $("#tDesc", root).value, supplierIds: [...m.selected] });
          toast(`تم إنشاء المناقصة ${r.refNo} وإصدار قائمة الدعوات`);
          location.hash = `#/tenders/${r.id}`;
        } catch (e) { $("#tErr", root).textContent = errText(e); return false; }
      }
    }]
  });
}

// ============================================================ سجل الموردين
async function renderSuppliers() {
  crumbs("الموردون", "سجل الموردين");
  const f = (() => { try { return JSON.parse(sessionStorage.getItem("ss.filters") || "{}"); } catch { return {}; } })();
  view().innerHTML = `
  <div class="page-head"><div><h1>سجل الموردين</h1><p>البحث والتصفية حسب النشاط والحالة والفئة المالية.</p></div>
    <div class="row no-print"><a class="btn" href="/api/suppliers/export.xlsx">⬇ Excel</a><button class="btn" onclick="printPdf()">📄 PDF</button><a class="btn btn-primary" href="#/suppliers/new">＋ تعريف مورد جديد</a></div></div>
  <div class="print-only print-head"><h1>سجل الموردين</h1><div>منظومة إدارة وتأهيل الموردين · تاريخ الطباعة <span class="num">${today()}</span></div></div>
  <div class="card">
    <div class="card-head no-print" style="flex-wrap:wrap">
      <input class="input" id="fQ" placeholder="🔍 بحث بالاسم أو الرمز أو رقم السجل التجاري" style="flex:2;min-width:220px" value="${esc(f.q || "")}">
      <select class="select" id="fAct" style="flex:1;min-width:160px"><option value="">كل الأنشطة</option>${state.meta.activities.map(a => `<option ${a === f.activity ? "selected" : ""}>${esc(a)}</option>`).join("")}</select>
      <select class="select" id="fStatus" style="flex:1;min-width:130px"><option value="">كل الحالات</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === f.status ? "selected" : ""}>${v[0]}</option>`).join("")}</select>
      <select class="select" id="fTier" style="flex:1;min-width:120px"><option value="">كل الفئات</option>${Object.entries(TIER_NAME).map(([k, v]) => `<option value="${k}" ${k === f.tier ? "selected" : ""}>${v}</option>`).join("")}</select>
      <select class="select" id="fCity" style="flex:1;min-width:110px"><option value="">كل المدن</option>${state.meta.cities.map(c => `<option ${c === f.city ? "selected" : ""}>${c}</option>`).join("")}</select>
    </div>
    <div id="sTable"></div>
  </div>`;
  const load = async () => {
    const q = { q: $("#fQ").value, activity: $("#fAct").value, status: $("#fStatus").value, tier: $("#fTier").value, city: $("#fCity").value };
    try { sessionStorage.setItem("ss.filters", JSON.stringify(q)); } catch { }
    const rows = await api("GET", "/api/suppliers?" + new URLSearchParams(Object.entries(q).filter(([, v]) => v)));
    const printTbl = `<table class="print-only print-tbl"><thead><tr><th>م</th><th>الرمز</th><th>المورد</th><th>المدينة</th><th>النشاط الرئيسي</th><th>رأس المال (د.ل)</th><th>الفئة</th><th>انتهاء السجل</th><th>الحالة</th></tr></thead><tbody>
      ${rows.map((r, n) => `<tr><td>${n + 1}</td><td class="nw">${r.code}</td><td>${esc(r.nameAr)}</td><td>${esc(r.city)}</td><td>${esc(r.mainActivity)}</td><td class="nw">${nf.format(r.capital)}</td><td class="nw">${TIER_NAME[r.tier].split(" —")[0]}</td><td>${r.commercialRegExpiryDate || "—"}</td><td>${STATUS[r.status]?.[0] || r.status}</td></tr>`).join("")}
      </tbody></table><p class="print-only small">عدد الموردين: ${rows.length}</p>`;
    $("#sTable").innerHTML = printTbl + `<div class="table-wrap no-print"><table class="tbl"><thead><tr>
      <th>الفئة</th><th>المورد</th><th>النشاط الرئيسي</th><th>المدينة</th><th>رأس المال</th><th>السجل التجاري</th><th>مزاولة النشاط</th><th>الحالة</th></tr></thead><tbody>
      ${rows.length ? rows.map(r => `<tr class="clickable" onclick="location.hash='#/suppliers/${r.id}'">
        <td>${tierBadge(r.tier)}</td>
        <td><div class="name">${esc(r.nameAr)} ${r.alertLevel !== "ok" ? `<span title="تنبيه صلاحية" style="color:var(--${r.alertLevel === "danger" ? "danger" : "warn"})">●</span>` : ""}</div><div class="muted small"><span class="num">${r.code}</span> · ${esc(r.legalForm)}</div></td>
        <td>${esc(r.mainActivity)}${r.subActivities.length ? `<div class="muted small">+${r.subActivities.length} نشاط فرعي</div>` : ""}</td>
        <td>${esc(r.city)}</td><td class="nowrap">${money(r.capital)}</td>
        <td><span class="num small">${esc(r.commercialRegNo)}</span><div>${validityBadge(r.commercialRegExpiryDate)}</div></td>
        <td>${validityBadge(r.practiceLicenseExpiryDate)}</td>
        <td>${statusBadge(r.status)}${r.missing ? `<div class="muted small">${r.missing} بيانات ناقصة</div>` : ""}</td></tr>`).join("")
        : `<tr><td colspan="8" class="empty">لا توجد نتائج مطابقة</td></tr>`}
      </tbody></table></div><div class="card-body muted small no-print">عدد النتائج: <b class="num">${rows.length}</b></div>`;
  };
  $("#fQ").oninput = debounce(load);
  ["#fAct", "#fStatus", "#fTier", "#fCity"].forEach(s => $(s).onchange = load);
  await load();
}

// ============================================================ صفحة إضافة / تعديل المورد (صفحة واحدة بكل البيانات والمستندات)
const SECTIONS = [
  { key: "basic", title: "البيانات الأساسية والتواصل", icon: "🏷", docs: [] },
  { key: "cr", title: "النشاط والسجل التجاري", icon: "📄", docs: ["CommercialRegistry", "ChamberCertificate"] },
  { key: "license", title: "إذن مزاولة النشاط", icon: "🪪", docs: ["PracticeLicense"] },
  { key: "realestate", title: "السجل العقاري للمقر", icon: "🏢", docs: ["RealEstateRegistry"] },
  { key: "inc", title: "عقد التأسيس والشركاء", icon: "📜", docs: ["IncorporationContract", "SignatoryAuthorization"] },
  { key: "fin", title: "البيانات المالية والضريبية", icon: "💰", docs: ["TaxCertificate", "BankLetter", "SocialSecurityCertificate", "AuditedFinancials"] },
  { key: "extra", title: "مستندات إضافية", icon: "📎", docs: ["QualityCertificate", "ClassificationCertificate", "Other"] },
];
const CORE_DOCS = Object.keys(DOC_TYPES).filter(k => DOC_TYPES[k][2]);

const FIELDS = {
  extra: [],
  basic: [
    { k: "nameAr", l: "اسم المورد (بالعربية)", req: true, full: true, ph: "كما ورد في السجل التجاري" },
    { k: "nameEn", l: "الاسم باللغة الإنجليزية", ltr: true },
    { k: "legalForm", l: "الشكل القانوني", req: true, type: "select", opts: () => state.meta.legalForms },
    { k: "city", l: "المدينة", req: true, type: "select", opts: () => state.meta.cities },
    { k: "address", l: "العنوان التفصيلي" },
    { k: "phone", l: "هاتف الشركة", ltr: true, ph: "021-0000000" },
    { k: "email", l: "البريد الإلكتروني", ltr: true, type: "email", ph: "info@company.ly" },
    { k: "contactPerson", l: "مسؤول التواصل" },
    { k: "contactPhone", l: "هاتف مسؤول التواصل", ltr: true, ph: "091-0000000" },
  ],
  cr: [
    { k: "mainActivity", l: "النشاط الرئيسي", req: true, type: "select", opts: () => state.meta.activities, full: true },
    { k: "subActivities", l: "الأنشطة الفرعية المرخصة", type: "chips", full: true },
    { k: "commercialRegNo", l: "رقم السجل التجاري", req: true, ltr: true, ph: "CR-0000-00000" },
    { k: "commercialRegExpiryDate", l: "تاريخ انتهاء السجل", type: "date", validity: true },
    { k: "commercialRegIssueDate", l: "تاريخ الإصدار", type: "date" },
    { k: "chamberNo", l: "رقم القيد بالغرفة التجارية", ltr: true },
  ],
  license: [
    { k: "practiceLicenseNo", l: "رقم إذن مزاولة النشاط", ltr: true, ph: "PL-0000-000" },
    { k: "practiceLicenseExpiryDate", l: "تاريخ الانتهاء", type: "date", validity: true },
    { k: "practiceLicenseAuthority", l: "الجهة المانحة", full: true, ph: "مثال: مراقبة الاقتصاد - طرابلس" },
  ],
  realestate: [
    { k: "realEstateRegNo", l: "رقم السجل العقاري / سند المقر", ltr: true, ph: "RE-00/0000" },
    { k: "realEstateOffice", l: "مكتب التسجيل العقاري" },
    { k: "premisesOwnership", l: "صفة إشغال المقر", type: "radio", opts: () => ["ملك", "إيجار"], full: true },
    { k: "leaseExpiryDate", l: "تاريخ انتهاء عقد الإيجار", type: "date", validity: true, showIf: d => d.premisesOwnership === "إيجار" },
  ],
  inc: [
    { k: "incorporationContractNo", l: "رقم عقد التأسيس", ltr: true, ph: "INC-0000-000" },
    { k: "incorporationDate", l: "تاريخ التأسيس", type: "date" },
    { k: "notaryOffice", l: "مكتب التوثيق" },
    { k: "authorizedSignatory", l: "المفوض بالتوقيع" },
    { k: "partners", l: "الشركاء / المساهمون ونسب الملكية", type: "partners", full: true },
  ],
  fin: [
    { k: "capital", l: "رأس المال المعلن (د.ل)", req: true, type: "amount" },
    { k: "paidUpCapital", l: "رأس المال المدفوع (د.ل)", type: "amount" },
    { k: "bankName", l: "المصرف" },
    { k: "bankAccount", l: "رقم الحساب / IBAN", ltr: true },
  ],
};

const EMPTY_SUPPLIER = () => ({ subActivities: [], premisesOwnership: "ملك", capital: 0, paidUpCapital: null });

async function renderWizard(id) {
  const isEdit = id != null;
  if (!user.can("Procurement")) {
    crumbs("الموردون", isEdit ? "تعديل" : "إضافة مورد");
    view().innerHTML = `<div class="card card-pad callout warn">إضافة وتعديل الموردين من صلاحية <b>مسؤول المشتريات</b>. غيّر الدور من أعلى الصفحة.</div>`;
    return;
  }
  let data = EMPTY_SUPPLIER(), docs = [], pending = {}, errors = {}, tried = false;
  const DRAFT = "ss.draft";
  if (isEdit) {
    const r = await api("GET", `/api/suppliers/${id}`);
    data = { ...r.supplier, subActivities: r.subActivities };
    docs = r.supplier.documents;
    crumbs("الموردون", `<a href="#/suppliers/${id}">${esc(data.nameAr)}</a>`, "تعديل البيانات");
  } else {
    crumbs("الموردون", "إضافة مورد جديد");
    try { const d = JSON.parse(localStorage.getItem(DRAFT) || "null"); if (d) { data = { ...data, ...d }; setTimeout(() => toast("تمت استعادة المسودة المحفوظة"), 300); } } catch { }
  }
  const saveDraft = debounce(() => { if (!isEdit) try { localStorage.setItem(DRAFT, JSON.stringify(data)); } catch { } }, 400);
  const isReq = f => typeof f.req === "function" ? f.req(data) : f.req;
  const parsePartners = () => (data.partners || "").split("\n").filter(Boolean).map(l => { const [n, p] = l.split("|").map(x => x.trim()); return { n: n || "", p: parseFloat(p) || "" }; });
  const partnersTotal = () => { const p = parsePartners().filter(x => x.n || x.p); return p.length ? Math.round(p.reduce((a, x) => a + (Number(x.p) || 0), 0) * 100) / 100 : null; };
  const hasDoc = t => !!pending[t] || docs.some(d => d.type === t);

  function validateSection(key) {
    const e = {};
    for (const f of FIELDS[key]) {
      if (f.showIf && !f.showIf(data)) continue;
      const v = data[f.k];
      if (isReq(f) && (v == null || v === "" || (f.type === "amount" && !(v > 0)))) e[f.k] = "هذا الحقل مطلوب";
    }
    if (key === "basic" && data.nameAr && data.nameAr.trim().length < 3) e.nameAr = "3 أحرف على الأقل";
    if (key === "basic" && data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) e.email = "صيغة البريد غير صحيحة";
    if (key === "cr" && data.commercialRegIssueDate && data.commercialRegExpiryDate && data.commercialRegIssueDate > data.commercialRegExpiryDate) e.commercialRegExpiryDate = "يجب أن يكون بعد تاريخ الإصدار";
    if (key === "inc" && data.incorporationDate && data.incorporationDate > today()) e.incorporationDate = "لا يمكن أن يكون مستقبلياً";
    if (key === "inc") { const t = partnersTotal(); if (t != null && Math.abs(t - 100) > .01) e.partners = `مجموع نسب الملكية ${t}% — يجب أن يساوي 100%`; }
    if (key === "fin" && data.paidUpCapital != null && data.paidUpCapital > data.capital) e.paidUpCapital = "لا يتجاوز رأس المال المعلن";
    return e;
  }
  const sectionDone = key => !Object.keys(validateSection(key)).length;

  view().innerHTML = `
  <div class="page-head"><div><h1>${isEdit ? "تعديل بيانات المورد" : "إضافة مورد جديد"}</h1>
    <p>${isEdit ? `<span class="num">${esc(data.code)}</span> — بعد الحفظ يعود الملف إلى سير المراجعة (المالي ← القانوني ← اعتماد إدارة الفرع).` : "الحقول المعلّمة بـ <span class=\"req\">*</span> فقط إلزامية للحفظ. أدخل المتوفر من بيانات المستندات ومرفقاتها الآن واستكمل الباقي لاحقاً؛ تُطلب كاملة قبل الاعتماد القانوني واعتماد التفعيل."}</p></div>
    <div class="row">${!isEdit ? `<button class="btn btn-ghost" id="clearDraft">مسح المسودة</button>` : ""}<a class="btn" href="${isEdit ? `#/suppliers/${id}` : "#/suppliers"}">إلغاء</a></div></div>
  <div class="card form-progress" id="progress"></div>
  <div class="stack" id="sections" style="margin-top:16px"></div>
  <div class="save-bar" id="saveBar"></div>`;
  $("#clearDraft") && ($("#clearDraft").onclick = () => { try { localStorage.removeItem(DRAFT); } catch { } data = EMPTY_SUPPLIER(); pending = {}; errors = {}; tried = false; draw(); toast("تم مسح المسودة"); });

  const ESSENTIALS = Object.values(FIELDS).flat().filter(f => f.req === true);
  const filled = v => v != null && v !== "" && v !== 0 && !(Array.isArray(v) && !v.length);
  const hasRequired = key => FIELDS[key].some(f => isReq(f));
  const sectionFilled = key => FIELDS[key].some(f => filled(data[f.k])) || SECTIONS.find(x => x.key === key).docs.some(hasDoc);
  function progressHtml() {
    const ess = ESSENTIALS.filter(f => filled(data[f.k])).length, coreDocs = CORE_DOCS.filter(hasDoc).length;
    const pctv = Math.round(ess / ESSENTIALS.length * 100);
    return `<div class="row between"><b>${ess === ESSENTIALS.length ? "✓ جاهز للحفظ" : "البيانات الأساسية الإلزامية"} <span class="num">${ess}</span> من ${ESSENTIALS.length}</b>
        <span class="muted small">المستندات الإلزامية المرفقة: <span class="num">${coreDocs}</span> من ${CORE_DOCS.length} (تُشترط عند المراجعة، ويمكن إرفاقها لاحقاً)</span></div>
      <div class="progress" style="margin:8px 0 10px"><div style="width:${pctv}%"></div></div>
      <div class="chips">${SECTIONS.map(s => { const ok = hasRequired(s.key) ? sectionDone(s.key) : sectionFilled(s.key); return `<button type="button" class="chip ${ok ? "on" : ""}" data-jump="${s.key}">${ok ? "✓ " : ""}${s.title}${hasRequired(s.key) ? "" : s.docs.some(d => DOC_TYPES[d][2]) ? " · مستند إلزامي للمراجعة" : " · اختياري"}</button>`; }).join("")}</div>`;
  }
  function refresh() {
    $("#progress").innerHTML = progressHtml();
    $$("[data-jump]").forEach(b => b.onclick = () => $(`#sec-${b.dataset.jump}`).scrollIntoView({ behavior: "smooth", block: "start" }));
    SECTIONS.forEach(s => { const b = $(`[data-secbadge="${s.key}"]`); if (b) b.outerHTML = secBadge(s.key); });
  }
  const secBadge = key => !hasRequired(key) && sectionDone(key)
    ? (sectionFilled(key) ? `<span class="badge b-ok" data-secbadge="${key}">✓ مُدخل</span>` : `<span class="badge" data-secbadge="${key}">اختياري — يُستكمل لاحقاً</span>`)
    : sectionDone(key) ? `<span class="badge b-ok" data-secbadge="${key}">مكتمل</span>` : `<span class="badge ${tried ? "b-danger" : "b-warn"}" data-secbadge="${key}">${tried ? "يحتاج استكمال" : "حقول إلزامية"}</span>`;

  function docSlot(t) {
    const [label, ico] = DOC_TYPES[t];
    const existing = docs.filter(d => d.type === t), file = pending[t], has = file || existing.length;
    return `<label class="doc-slot ${has ? "has" : ""}" data-doc="${t}"><input type="file" accept=".pdf,.jpg,.jpeg,.png"><span class="ds-ico">${ico}</span>
      <div style="flex:1;min-width:0"><b>${label}</b> ${docReqBadge(t)}
      <div class="muted small" style="overflow-wrap:anywhere">${file ? `سيُرفع: ${esc(file.name)}` : existing.length ? `مرفق: ${existing.map(d => esc(d.fileName)).join("، ")}` : "اضغط لاختيار ملف (PDF / JPG / PNG)"}</div></div>
      <span>${has ? "✓" : "⬆"}</span></label>`;
  }

  function finExtra() {
    const st = state.meta.settings, cap = Number(data.capital) || 0;
    if (!cap) return "";
    const t = tierOf(cap, st);
    if (t === "U") return `<div class="callout warn full" id="finExtra">${tierBadge(t)} <span>رأس المال أقل من الحد الأدنى للتصنيف (${moneyTxt(st.tierCMin)}). يُحفظ المورد «غير مصنف» ولا يُرشح للمناقصات.</span></div>`;
    return `<div class="callout info full" id="finExtra">${tierBadge(t)} <span>التصنيف الآلي: <b>${TIER_NAME[t]}</b> · الحد الأقصى لقيمة المناقصة ${money(cap * st.maxTenderToCapitalRatio)}</span></div>`;
  }

  function fieldHtml(f) {
    if (f.showIf && !f.showIf(data)) return "";
    const v = data[f.k], err = errors[f.k], id = `f_${f.k}`, cls = `input ${err ? "invalid" : ""}`;
    let ctl;
    switch (f.type) {
      case "select": ctl = `<select id="${id}" data-k="${f.k}" class="select ${err ? "invalid" : ""}"><option value="">— اختر —</option>${f.opts().map(o => `<option ${o === v ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`; break;
      case "date": ctl = `<input id="${id}" data-k="${f.k}" type="date" class="${cls}" value="${esc(v ? String(v).slice(0, 10) : "")}">`; break;
      case "amount": ctl = `<div class="input-group"><input id="${id}" data-k="${f.k}" data-amount class="${cls}" dir="ltr" inputmode="numeric" value="${v || ""}" style="padding-left:44px"><span class="suffix" style="left:12px;right:auto">د.ل</span></div><div class="hint" data-words="${f.k}">${amountWords(v)}</div>`; break;
      case "chips": ctl = `<div class="chips">${state.meta.activities.map(a => `<button type="button" class="chip ${(v || []).includes(a) ? "on" : ""} ${a === data.mainActivity ? "disabled" : ""}" data-chip="${esc(a)}">${esc(a)}</button>`).join("")}</div>`; break;
      case "radio": ctl = `<div class="radio-cards">${f.opts().map(o => `<label class="radio-card ${v === o ? "on" : ""}"><input type="radio" name="${f.k}" data-k="${f.k}" value="${o}" ${v === o ? "checked" : ""}> <b>${o === "ملك" ? "🏠 ملك" : "📝 إيجار"}</b></label>`).join("")}</div>`; break;
      case "partners": {
        const rows = parsePartners(); if (!rows.length) rows.push({ n: "", p: "" });
        const t = partnersTotal();
        ctl = `<table class="tbl partners-table"><thead><tr><th>اسم الشريك / المساهم</th><th style="width:140px">نسبة الملكية %</th><th style="width:50px"></th></tr></thead><tbody>
          ${rows.map((r, i) => `<tr><td><input class="input" data-pn="${i}" value="${esc(r.n)}"></td><td><input class="input" dir="ltr" type="number" min="0" max="100" step="0.01" data-pp="${i}" value="${r.p}"></td><td><button type="button" class="btn btn-sm btn-ghost" data-pdel="${i}">✕</button></td></tr>`).join("")}
          </tbody></table><div class="row between" style="margin-top:8px"><button type="button" class="btn btn-sm" id="padd">＋ إضافة شريك</button>
          <span class="small">المجموع: <b class="num" id="ptotal" style="color:${t == null ? "inherit" : Math.abs(t - 100) < .01 ? "var(--ok)" : "var(--danger)"}">${t ?? 0}%</b></span></div>`;
        break;
      }
      default: ctl = `<input id="${id}" data-k="${f.k}" type="${f.type || "text"}" class="${cls}" ${f.ltr ? 'dir="ltr"' : ""} placeholder="${esc(f.ph || "")}" value="${esc(v ?? "")}">`;
    }
    return `<div class="${f.full ? "full" : ""}"><label class="lbl" for="${id}">${f.l}${isReq(f) ? '<span class="req">*</span>' : ""}</label>${ctl}
      ${f.validity ? `<div class="validity" data-val="${f.k}">${v ? validityBadge(v) : ""}</div>` : ""}<div class="field-err" data-err="${f.k}">${err || ""}</div></div>`;
  }

  function draw() {
    $("#sections").innerHTML = SECTIONS.map(s => `
      <section class="card form-section" id="sec-${s.key}">
        <div class="card-head"><h2>${s.icon} ${s.title}</h2>${secBadge(s.key)}</div>
        <div class="card-body sec-body ${s.docs.length ? "" : "no-docs"} ${FIELDS[s.key].length ? "" : "only-docs"}">
          ${FIELDS[s.key].length ? `<div class="form-grid">${FIELDS[s.key].map(fieldHtml).join("")}${s.key === "fin" ? finExtra() : ""}</div>` : ""}
          ${s.docs.length ? `<div class="sec-docs"><div class="lbl">📎 المستندات</div>${s.docs.map(docSlot).join("")}</div>` : ""}
        </div>
      </section>`).join("");
    $("#saveBar").innerHTML = `<span class="small">${isEdit ? "سيُعاد الملف إلى سير المراجعة بعد الحفظ." : "يكفي إدخال البيانات الأساسية للحفظ. بعده: المراجعة المالية ← القانونية ← اعتماد إدارة الفرع."}</span>
      <div class="row"><a class="btn" href="${isEdit ? `#/suppliers/${id}` : "#/suppliers"}">إلغاء</a><button class="btn btn-ok btn-lg" id="submit">${isEdit ? "💾 حفظ التعديلات" : "✓ حفظ وتسجيل المورد"}</button></div>`;
    bind(); refresh();
  }

  function bind() {
    $$("[data-k]", $("#sections")).forEach(el => {
      const k = el.dataset.k;
      if (el.dataset.amount !== undefined) {
        bindAmount(el, v => { data[k] = v || (k === "capital" ? 0 : null); delete errors[k]; $(`[data-words="${k}"]`).textContent = amountWords(v); saveDraft(); refreshFin(); refreshSoon(); });
        return;
      }
      const ev = el.tagName === "SELECT" || el.type === "radio" || el.type === "date" ? "change" : "input";
      el.addEventListener(ev, () => {
        data[k] = el.value; delete errors[k]; saveDraft(); el.classList.remove("invalid");
        const e = $(`[data-err="${k}"]`); if (e) e.textContent = "";
        const vb = $(`[data-val="${k}"]`); if (vb) vb.innerHTML = el.value ? validityBadge(el.value) : "";
        if (k === "mainActivity" || k === "premisesOwnership") { data.subActivities = (data.subActivities || []).filter(a => a !== data.mainActivity); draw(); return; }
        refreshSoon();
      });
    });
    $$("[data-chip]").forEach(c => c.onclick = () => {
      const a = c.dataset.chip, set = new Set(data.subActivities || []);
      set.has(a) ? set.delete(a) : set.add(a); data.subActivities = [...set]; c.classList.toggle("on"); saveDraft();
    });
    const readRows = () => $$("[data-pn]").map((el, i) => ({ n: el.value.trim(), p: $(`[data-pp="${i}"]`).value }));
    const writePartners = rows => { data.partners = rows.filter(r => r.n || r.p).map(r => `${r.n} | ${r.p}%`).join("\n"); saveDraft(); };
    const updateTotal = () => {
      const t = partnersTotal(), el = $("#ptotal"); if (!el) return;
      el.textContent = `${t ?? 0}%`; el.style.color = t == null ? "inherit" : Math.abs(t - 100) < .01 ? "var(--ok)" : "var(--danger)";
      if (t == null || Math.abs(t - 100) < .01) { const e = $('[data-err="partners"]'); if (e) e.textContent = ""; }
      refreshSoon();
    };
    const bindPartner = el => el.addEventListener("input", () => { writePartners(readRows()); updateTotal(); });
    $$("[data-pn],[data-pp]").forEach(bindPartner);
    $("#padd") && ($("#padd").onclick = () => {
      const tb = $(".partners-table tbody"), i = $$("[data-pn]").length;
      tb.insertAdjacentHTML("beforeend", `<tr><td><input class="input" data-pn="${i}"></td><td><input class="input" dir="ltr" type="number" min="0" max="100" step="0.01" data-pp="${i}"></td><td></td></tr>`);
      $$(`[data-pn="${i}"],[data-pp="${i}"]`).forEach(bindPartner); $(`[data-pn="${i}"]`).focus();
    });
    $$("[data-pdel]").forEach(b => b.onclick = () => { const r = readRows(); r.splice(+b.dataset.pdel, 1); writePartners(r); draw(); });
    $$("[data-doc] input[type=file]").forEach(inp => inp.onchange = () => {
      const t = inp.closest("[data-doc]").dataset.doc, file = inp.files[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) return toast("الحجم الأقصى للملف 10 ميغابايت", true);
      if (!/\.(pdf|jpe?g|png)$/i.test(file.name)) return toast("الصيغ المسموحة: PDF, JPG, PNG", true);
      pending[t] = file; inp.closest("[data-doc]").outerHTML = docSlot(t); bind(); refresh();
    });
    $("#submit").onclick = submit;
  }
  const refreshSoon = debounce(refresh, 200);
  const refreshFin = debounce(() => { const old = $("#finExtra"), html = finExtra(); if (old) { if (html) old.outerHTML = html; else old.remove(); } else if (html) $("#sec-fin .form-grid").insertAdjacentHTML("beforeend", html); }, 150);

  async function submit() {
    tried = true;
    errors = {}; SECTIONS.forEach(s => Object.assign(errors, validateSection(s.key)));
    if (Object.keys(errors).length) {
      draw();
      const first = SECTIONS.find(s => !sectionDone(s.key));
      $(`#sec-${first.key}`).scrollIntoView({ behavior: "smooth", block: "start" });
      toast(`يرجى استكمال: ${first.title}`, true); return;
    }
    const btn = $("#submit"); btn.disabled = true; btn.textContent = "جارٍ الحفظ…";
    const payload = { ...data };
    ["commercialRegIssueDate", "commercialRegExpiryDate", "practiceLicenseIssueDate", "practiceLicenseExpiryDate", "realEstateRegDate", "leaseExpiryDate", "incorporationDate"]
      .forEach(k => payload[k] = payload[k] ? String(payload[k]).slice(0, 10) : null);
    try {
      const r = isEdit ? await api("PUT", `/api/suppliers/${id}`, payload) : await api("POST", "/api/suppliers", payload);
      const sid = isEdit ? id : r.id;
      let up = 0;
      for (const [type, file] of Object.entries(pending)) {
        const fd = new FormData(); fd.append("file", file); fd.append("type", type);
        try { await api("POST", `/api/suppliers/${sid}/documents`, fd, true); up++; } catch (e) { toast(`تعذر رفع ${DOC_TYPES[type][0]}: ${errText(e)}`, true); }
      }
      if (!isEdit) try { localStorage.removeItem(DRAFT); } catch { }
      toast(isEdit ? "تم حفظ التعديلات وأُعيد الملف إلى سير المراجعة" : `تم تسجيل المورد ${r.code} بحالة «قيد المراجعة»${up ? ` ورفع ${up} مستند` : ""}`);
      location.hash = `#/suppliers/${sid}`;
    } catch (e) {
      btn.disabled = false; btn.textContent = isEdit ? "💾 حفظ التعديلات" : "✓ حفظ وتسجيل المورد";
      const se = {}; Object.entries(e.errors || {}).forEach(([k, v]) => se[k.charAt(0).toLowerCase() + k.slice(1)] = v[0]);
      if (Object.keys(se).length) { errors = se; draw(); const s = SECTIONS.find(s => FIELDS[s.key].some(f => se[f.k])); s && $(`#sec-${s.key}`).scrollIntoView({ behavior: "smooth" }); }
      toast(errText(e), true);
    }
  }

  draw();
}

// ============================================================ ملف المورد
async function renderProfile(id) {
  const [r, history] = await Promise.all([api("GET", `/api/suppliers/${id}`), api("GET", `/api/audit?entity=Supplier&entityId=${id}&take=50`)]);
  const s = r.supplier, st = state.meta.settings;
  crumbs("الموردون", `<a href="#/suppliers">سجل الموردين</a>`, esc(s.nameAr));
  const kv = rows => `<div class="kv">${rows.map(([k, v]) => `<div><div class="k">${k}</div><div class="v">${v || '<span class="muted">—</span>'}</div></div>`).join("")}</div>`;
  const docsOf = t => s.documents.filter(d => d.type === t);
  const docLinks = t => docsOf(t).length ? docsOf(t).map(d => `<a class="badge b-info no-dot" href="/api/documents/${d.id}" target="_blank">📎 ${esc(d.fileName)}</a>`).join(" ") : DOC_TYPES[t]?.[2] ? `<span class="badge b-warn no-dot">لم تُرفق الوثيقة (إلزامية)</span>` : `<span class="badge no-dot">لم تُرفق (اختيارية)</span>`;
  const legal = (icon, title, type, rows, expiry) => `<div class="legal-card"><div class="lc-head"><div class="lc-title"><span class="lc-ico">${icon}</span>${title}</div>${expiry !== undefined ? validityBadge(expiry) : ""}</div>${kv(rows)}<div style="margin-top:12px">${docLinks(type)}</div></div>`;
  const canStatus = user.can("Legal", "Management");
  // سير عمل متسلسل في نفس الصفحة: المالي ← القانوني ← اعتماد التفعيل (إدارة الفرع)
  const STAGES = [
    { track: "financial", title: "المراجعة المالية", role: "Finance", state: s.financialApproval, by: s.financialApprovedBy, at: s.financialApprovedAt, notes: s.financialNotes,
      checks: ["شهادة السداد الضريبي والإفادة المصرفية مرفقتان", "رأس المال المعلن مطابق للإفادة المصرفية", "التصنيف المالي صحيح: " + TIER_NAME[r.tier]] },
    { track: "legal", title: "المراجعة القانونية", role: "Legal", state: s.legalApproval, by: s.legalApprovedBy, at: s.legalApprovedAt, notes: s.legalNotes,
      checks: ["السجل التجاري وإذن مزاولة النشاط ساريان ومرفقان", "سند المقر مسجل في السجل العقاري ومرفق", "بيانات السجلات مكتملة"] },
    { track: "activation", title: "اعتماد التفعيل", role: "Management", state: s.activationApproval, by: s.activationApprovedBy, at: s.activationApprovedAt, notes: s.activationNotes,
      checks: ["اكتملت المراجعتان المالية والقانونية", "المستندات الإلزامية الخمسة مرفقة"] },
  ];
  const blocked = ["Suspended", "Rejected"].includes(s.status);
  const returnedIx = STAGES.findIndex(x => x.state === "Returned");
  const activeIx = blocked || returnedIx >= 0 ? -1 : STAGES.findIndex(x => x.state !== "Approved");
  const missingDocs = r.missingDocuments || [];
  const stepper = `<div class="wf-steps">${STAGES.map((x, i) => {
    const cls = x.state === "Approved" ? "done" : x.state === "Returned" ? "ret" : i === activeIx ? "on" : "";
    return `<div class="wf-step ${cls}"><span class="wf-num">${x.state === "Approved" ? "✓" : x.state === "Returned" ? "↩" : i + 1}</span><div><b>${x.title}</b><div class="small muted">${ROLE_NAME[x.role]}</div></div></div>`;
  }).join('<span class="wf-line"></span>')}</div>`;
  function stageBox(x, i) {
    const active = i === activeIx;
    const badge = x.state === "Approved" ? '<span class="badge b-ok">معتمد</span>' : x.state === "Returned" ? '<span class="badge b-danger">مُرجع</span>'
      : active ? '<span class="badge b-warn">بانتظار القرار</span>' : '<span class="badge">لم تبدأ</span>';
    const canAct = active && user.can(x.role);
    const stageMissing = x.track === "activation" ? missingDocs : missingDocs.filter(t => DOC_TYPES[t]?.[4] === x.track);
    const dataMissing = x.track === "legal" ? r.missing : [];
    const docsBlock = active && (stageMissing.length || dataMissing.length);
    return `<div class="approval wf-box ${active ? "active" : ""} ${x.state === "Approved" ? "done" : ""}">
      <div class="row between"><b>${i + 1} · ${x.title}</b>${badge}</div>
      <div class="muted small" style="margin:4px 0">المسؤول: ${ROLE_NAME[x.role]}</div>
      ${x.by && x.state !== "Pending" ? `<div class="small">${x.state === "Approved" ? "اعتمده" : "أرجعه"}: ${esc(x.by)} · <span class="num">${fdt(x.at)}</span></div>` : ""}
      ${x.notes && x.state !== "Pending" ? `<div class="small" style="margin-top:4px">📝 ${esc(x.notes)}</div>` : ""}
      ${active ? `<ul class="wf-checks">${x.checks.map(c => `<li>☑ ${c}</li>`).join("")}</ul>` : ""}
      ${docsBlock ? `<div class="callout danger small">لا يمكن ${x.track === "activation" ? "التفعيل" : "الاعتماد"} قبل ${[dataMissing.length ? `استكمال: ${dataMissing.join("، ")}` : "", stageMissing.length ? `إرفاق: ${stageMissing.map(t => DOC_TYPES[t]?.[0] || t).join("، ")}` : ""].filter(Boolean).join(" و")}${user.can("Procurement") ? ` · <a href="#/suppliers/${id}/edit">استكمال الملف</a>` : ""}</div>` : ""}
      ${canAct ? `<div class="row no-print" style="margin-top:10px"><button class="btn btn-sm btn-ok" data-rev="${x.track}" data-d="approve" ${docsBlock ? "disabled" : ""}>${x.track === "activation" ? "✓ اعتماد التفعيل" : "✓ اعتماد"}</button><button class="btn btn-sm btn-danger" data-rev="${x.track}" data-d="return">↩ إرجاع للتصحيح</button></div>`
        : active ? `<div class="muted small" style="margin-top:8px">بانتظار قرار «${ROLE_NAME[x.role]}» — غيّر الدور من أعلى الصفحة للتجربة.</div>` : ""}
    </div>`;
  }
  const wfNote = s.status === "Qualified" ? '<div class="callout ok small">✓ اكتمل سير العمل: المورد نشط ومؤهل ويظهر في ترشيح المناقصات.</div>'
    : returnedIx >= 0 ? '<div class="callout warn small">↩ الملف مُرجع للتصحيح. يعدّله مسؤول المشتريات من «تعديل البيانات»، فيعود تلقائياً إلى سير المراجعة.</div>'
    : blocked ? '<div class="callout danger small">المورد موقوف؛ سير العمل متوقف حتى إعادة تفعيله.</div>'
    : '<div class="callout info small">كل اعتماد ينقل الملف إلى المرحلة التالية في نفس الصفحة. اعتماد إدارة الفرع خطوة أخيرة إلزامية قبل التفعيل.</div>';

  view().innerHTML = `
  <div class="card card-pad">
    <div class="profile-head">
      <div class="avatar">${esc(s.nameAr.replace(/^(شركة|المكتب)\s*/, "").charAt(0))}</div>
      <div style="flex:1">
        <div class="row"><h1>${esc(s.nameAr)}</h1>${statusBadge(s.status)}</div>
        <div class="muted">${esc(s.nameEn || "")} · <span class="num">${s.code}</span> · ${esc(s.legalForm)} · ${esc(s.city)}</div>
        <div class="row" style="margin-top:10px">${tierBadge(r.tier)} <span>${TIER_NAME[r.tier]}</span> <span class="muted">·</span>
          <span>رأس المال ${money(s.capital)}</span> <span class="muted">·</span> <span>الحد الأقصى للمناقصة ${money(r.maxTenderValue)}</span></div>
      </div>
      <div class="row no-print">
        ${user.can("Procurement") ? `<a class="btn" href="#/suppliers/${id}/edit">✎ تعديل البيانات</a>` : ""}
        ${canStatus ? (s.status === "Suspended" || s.status === "Rejected" ? `<button class="btn" id="reactivate">↺ إعادة تفعيل</button>` : `<button class="btn btn-danger" id="suspend">⏸ إيقاف</button>`) : ""}
        ${user.role === "Admin" ? `<button class="btn btn-danger" id="del">🗑 حذف</button>` : ""}
        <button class="btn" onclick="window.print()">🖨 طباعة</button>
      </div>
    </div>
    ${stepper}
    ${r.alerts.length || r.missing.length || missingDocs.length ? `<div class="stack" style="margin-top:16px">
      ${r.missing.length ? `<div class="callout warn">⚠ بيانات لم تُستكمل بعد (مطلوبة قبل الاعتماد القانوني): ${r.missing.join("، ")}${user.can("Procurement") ? ` · <a href="#/suppliers/${id}/edit">استكمال البيانات</a>` : ""}</div>` : ""}
      ${missingDocs.length ? `<div class="callout warn">📎 مستندات إلزامية لم تُرفق بعد: ${missingDocs.map(t => `${DOC_TYPES[t]?.[0] || t} (قبل ${STAGE_NAME[DOC_TYPES[t]?.[4]] || "التفعيل"})`).join("، ")}${user.can("Procurement") ? ` · <a href="#/suppliers/${id}/edit">إرفاق المستندات</a>` : ""}</div>` : ""}
      ${r.alerts.map(a => `<div class="callout ${a.severity === "danger" ? "danger" : "warn"}">⏰ ${a.label}: ${a.days < 0 ? `منتهي منذ ${-a.days} يوم` : `ينتهي خلال ${a.days} يوم`} (${fdate(a.date)})</div>`).join("")}
    </div>` : ""}
  </div>

  <div class="grid g3" style="margin-top:16px;align-items:start">
    <div class="span2 stack">
      <div class="grid g2">
        ${legal("📄", "السجل التجاري", "CommercialRegistry", [["رقم السجل", `<span class="num">${esc(s.commercialRegNo)}</span>`], ["المكتب", esc(s.commercialRegOffice)], ["تاريخ الإصدار", fdate(s.commercialRegIssueDate)], ["تاريخ الانتهاء", fdate(s.commercialRegExpiryDate)], ["الغرفة التجارية", esc(s.chamberNo)], ["الرقم الضريبي", esc(s.taxNo)]], s.commercialRegExpiryDate)}
        ${legal("🪪", "إذن مزاولة النشاط", "PracticeLicense", [["رقم الإذن", `<span class="num">${esc(s.practiceLicenseNo)}</span>`], ["الجهة المانحة", esc(s.practiceLicenseAuthority)], ["تاريخ الإصدار", fdate(s.practiceLicenseIssueDate)], ["تاريخ الانتهاء", fdate(s.practiceLicenseExpiryDate)]], s.practiceLicenseExpiryDate)}
        ${legal("🏢", "السجل العقاري للمقر", "RealEstateRegistry", [["رقم السجل", `<span class="num">${esc(s.realEstateRegNo)}</span>`], ["المكتب", esc(s.realEstateOffice)], ["تاريخ التسجيل", fdate(s.realEstateRegDate)], ["صفة الإشغال", esc(s.premisesOwnership) + (s.leaseExpiryDate ? ` — حتى ${fdate(s.leaseExpiryDate)}` : "")], ["الوصف", esc(s.propertyDescription)]], s.premisesOwnership === "إيجار" ? s.leaseExpiryDate : undefined)}
        ${legal("📜", "عقد التأسيس", "IncorporationContract", [["رقم العقد", `<span class="num">${esc(s.incorporationContractNo)}</span>`], ["تاريخ التأسيس", fdate(s.incorporationDate)], ["مكتب التوثيق", esc(s.notaryOffice)], ["المفوض بالتوقيع", esc(s.authorizedSignatory)], ["الشركاء", esc(s.partners || "").replace(/\n/g, "<br>")]])}
      </div>
      <div class="card"><div class="card-head"><h2>النشاط والتواصل</h2></div><div class="card-body">
        ${kv([["النشاط الرئيسي", esc(s.mainActivity)], ["الأنشطة الفرعية", r.subActivities.map(a => `<span class="badge no-dot">${esc(a)}</span>`).join(" ")], ["العنوان", esc(s.address)], ["الهاتف", `<span class="num">${esc(s.phone)}</span>`], ["البريد", s.email ? `<a href="mailto:${esc(s.email)}">${esc(s.email)}</a>` : ""], ["الموقع", esc(s.website)], ["مسؤول التواصل", esc(s.contactPerson)], ["هاتفه", `<span class="num">${esc(s.contactPhone)}</span>`]])}
      </div></div>
      <div class="card"><div class="card-head"><h2>البيانات المالية</h2></div><div class="card-body">
        ${kv([["رأس المال المعلن", money(s.capital)], ["رأس المال المدفوع", s.paidUpCapital ? `${money(s.paidUpCapital)} (${pct(s.paidUpCapital / s.capital * 100)})` : ""], ["الفئة", `${tierBadge(r.tier)} ${TIER_NAME[r.tier]}`], ["الحد الأقصى لقيمة المناقصة", money(r.maxTenderValue)], ["المصرف", esc(s.bankName)], ["رقم الحساب", `<span class="num">${esc(s.bankAccount)}</span>`]])}
      </div></div>
      <div class="card"><div class="card-head"><h2>قائمة المستندات الرسمية</h2>
        <span class="badge ${missingDocs.length ? "b-warn" : "b-ok"}">الإلزامية: <span class="num">${CORE_DOCS.length - missingDocs.length}</span> من ${CORE_DOCS.length}</span>
        ${user.can("Procurement", "Legal", "Finance") ? `<div class="row no-print"><select class="select-sm" id="docType">${Object.entries(DOC_TYPES).map(([k, v]) => `<option value="${k}">${v[0]}${v[2] ? " (إلزامي)" : ""}</option>`).join("")}</select><label class="btn btn-sm btn-primary">⬆ رفع وثيقة<input type="file" id="docFile" accept=".pdf,.jpg,.jpeg,.png" hidden></label></div>` : ""}</div>
        <div class="card-body doc-check">${Object.entries(DOC_GROUPS).map(([g, gname]) => `
          <div class="dc-group"><div class="dc-title">${gname}</div>
          ${Object.keys(DOC_TYPES).filter(t => DOC_TYPES[t][3] === g).map(t => {
            const files = s.documents.filter(d => d.type === t), req = DOC_TYPES[t][2];
            const st = files.length ? `<span class="dc-st ok">✓ مرفق</span>` : req ? `<span class="dc-st miss">✕ غير مرفق</span>` : `<span class="dc-st">—</span>`;
            return `<div class="dc-row ${files.length ? "has" : req ? "miss" : ""}"><span class="dc-ico">${DOC_TYPES[t][1]}</span>
              <div class="dc-main"><div class="row" style="gap:8px"><b>${DOC_TYPES[t][0]}</b>${docReqBadge(t)}</div>
                ${files.length ? files.map(d => `<div class="small"><a href="/api/documents/${d.id}" target="_blank">${esc(d.fileName)}</a> <span class="muted">· ${(d.size / 1024).toFixed(0)} KB · ${esc(d.uploadedBy || "")} · <span class="num">${fdt(d.uploadedAt)}</span></span>${user.can("Procurement") ? ` <button class="btn btn-sm btn-ghost no-print" data-deldoc="${d.id}" title="حذف الملف">✕</button>` : ""}</div>`).join("") : `<div class="muted small">${DOC_TYPES[t][5] || ""}</div>`}
              </div>${st}</div>`;
          }).join("")}</div>`).join("")}
        </div></div>
    </div>

    <div class="stack">
      <div class="card" id="workflow"><div class="card-head"><h2>سير عمل المراجعة والاعتماد</h2></div><div class="card-body stack">
        ${STAGES.map(stageBox).join("")}
        ${wfNote}
      </div></div>
      <div class="card"><div class="card-head"><h2>سجل التعديلات</h2></div><div class="card-body">
        <div class="timeline">${history.length ? history.map(a => `<div class="tl-item"><div class="small">${esc(a.details)}</div><div class="tl-meta">${esc(a.user)} · ${ROLE_NAME[a.role] || a.role} · <span class="num">${fdt(a.timestamp)}</span></div></div>`).join("") : `<div class="muted small">لا توجد عمليات مسجلة</div>`}</div>
      </div></div>
    </div>
  </div>`;

  $$("[data-rev]").forEach(b => b.onclick = () => {
    const approve = b.dataset.d === "approve", track = b.dataset.rev;
    modal({
      title: approve ? (track === "activation" ? "اعتماد تفعيل المورد" : "تأكيد الاعتماد") : "إرجاع الملف للتصحيح",
      body: `<p>${approve ? "سيتم تسجيل اعتمادك باسمك في سجل التدقيق." : "سيُرجع الملف إلى مسؤول المشتريات مع ملاحظاتك."}</p>
        <label class="lbl">${approve ? "ملاحظات (اختياري)" : "سبب الإرجاع"} ${approve ? "" : '<span class="req">*</span>'}</label><textarea class="input" id="revNotes" rows="3"></textarea><div class="field-err" id="revErr"></div>`,
      actions: [{ label: "إلغاء" }, {
        label: approve ? "✓ اعتماد" : "↩ إرجاع", cls: approve ? "btn-ok" : "btn-primary", onClick: async root => {
          try { const res = await api("POST", `/api/suppliers/${id}/review`, { track, decision: b.dataset.d, notes: $("#revNotes", root).value }); toast(`تم. الحالة الحالية: ${STATUS[res.status][0]}`); router(); }
          catch (e) { $("#revErr", root).textContent = errText(e); return false; }
        }
      }]
    });
  });
  const statusDialog = (status, title) => modal({
    title, body: `<label class="lbl">السبب ${status === "PendingVerification" ? "(اختياري)" : '<span class="req">*</span>'}</label><textarea class="input" id="stReason" rows="3"></textarea><div class="field-err" id="stErr"></div>`,
    actions: [{ label: "إلغاء" }, {
      label: "تأكيد", cls: "btn-primary", onClick: async root => {
        try { await api("POST", `/api/suppliers/${id}/status`, { status, reason: $("#stReason", root).value }); toast("تم تحديث الحالة"); router(); }
        catch (e) { $("#stErr", root).textContent = errText(e); return false; }
      }
    }]
  });
  $("#suspend") && ($("#suspend").onclick = () => statusDialog("Suspended", "إيقاف المورد عن الترشيح"));
  $("#reactivate") && ($("#reactivate").onclick = () => statusDialog("PendingVerification", "إعادة تفعيل المورد"));
  $("#del") && ($("#del").onclick = () => modal({
    title: "حذف المورد نهائياً", body: `<div class="callout danger">سيتم حذف <b>${esc(s.nameAr)}</b> ووثائقه نهائياً. يُفضل استخدام «إيقاف» للحفاظ على السجل.</div>`,
    actions: [{ label: "إلغاء" }, { label: "🗑 حذف", cls: "btn-danger", onClick: async () => { try { await api("DELETE", `/api/suppliers/${id}`); toast("تم الحذف"); location.hash = "#/suppliers"; } catch (e) { toast(errText(e), true); } } }]
  }));
  $("#docFile") && ($("#docFile").onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    const fd = new FormData(); fd.append("file", f); fd.append("type", $("#docType").value);
    try { await api("POST", `/api/suppliers/${id}/documents`, fd, true); toast("تم رفع الوثيقة"); router(); } catch (err) { toast(errText(err), true); }
  });
  $$("[data-deldoc]").forEach(b => b.onclick = async () => {
    if (!confirm("حذف هذه الوثيقة؟")) return;
    try { await api("DELETE", `/api/documents/${b.dataset.deldoc}`); toast("تم حذف الوثيقة"); router(); } catch (e) { toast(errText(e), true); }
  });
}

// ============================================================ المناقصات
async function renderTenders() {
  crumbs("المناقصات", "قوائم الدعوات");
  const rows = await api("GET", "/api/tenders");
  view().innerHTML = `
  <div class="print-only print-head"><h1>سجل المناقصات وقوائم الدعوات</h1><div>منظومة إدارة وتأهيل الموردين · تاريخ الطباعة <span class="num">${today()}</span></div></div>
  <div class="page-head no-print"><div><h1>المناقصات وقوائم الدعوات</h1><p>تُنشأ المناقصة من شاشة المطابقة بعد تشغيل محرك الترشيح.</p></div>
    <div class="row"><a class="btn" href="/api/tenders/export.xlsx">⬇ Excel</a><button class="btn" onclick="printPdf()">📄 PDF</button><a class="btn btn-primary" href="#/match">⚖ مناقصة جديدة</a></div></div>
  <div class="card"><div class="table-wrap"><table class="tbl"><thead><tr><th>الرقم المرجعي</th><th>العنوان</th><th>النشاط</th><th>القيمة</th><th>الإقفال</th><th>المدعوون</th><th>أنشئت بواسطة</th></tr></thead><tbody>
    ${rows.length ? rows.map(t => `<tr class="clickable" onclick="location.hash='#/tenders/${t.id}'"><td class="num">${t.refNo}</td><td class="name">${esc(t.title)}</td><td>${esc(t.activity)}</td><td class="nowrap">${money(t.value)}</td><td>${fdate(t.closingDate)}</td><td><span class="badge b-info">${t.invited} مورد</span></td><td class="small">${esc(t.createdBy)}<div class="muted num">${fdt(t.createdAt)}</div></td></tr>`).join("")
      : `<tr><td colspan="7" class="empty">لم تُنشأ أي مناقصة بعد. <a href="#/match">ابدأ من شاشة المطابقة</a></td></tr>`}
  </tbody></table></div></div>`;
}

async function renderTender(id) {
  const t = await api("GET", `/api/tenders/${id}`);
  crumbs("المناقصات", `<a href="#/tenders">قوائم الدعوات</a>`, t.refNo);
  view().innerHTML = `
  <div class="page-head no-print"><div><h1>${esc(t.title)}</h1><p><span class="num">${t.refNo}</span> · ${esc(t.activity)}</p></div>
    <div class="row"><a class="btn" href="/api/tenders/${id}/export.xlsx">⬇ Excel</a><button class="btn btn-primary" onclick="printPdf()">📄 PDF</button></div></div>
  <div class="card card-pad">
    <div class="print-only print-head"><h1>قائمة الدعوات للمناقصة</h1><div>${esc(t.title)} · <span class="num">${t.refNo}</span></div><div class="small">منظومة إدارة وتأهيل الموردين · تاريخ الطباعة <span class="num">${today()}</span></div></div>
    <div class="grid g4">
      <div><div class="muted small">الرقم المرجعي</div><b class="num">${t.refNo}</b></div>
      <div><div class="muted small">القيمة التقديرية</div><b>${money(t.value)}</b></div>
      <div><div class="muted small">تاريخ الإقفال</div><b>${fdate(t.closingDate)}</b></div>
      <div><div class="muted small">عدد المدعوين</div><b class="num">${t.invitations.length}</b></div>
    </div>
    ${t.description ? `<div class="divider"></div><div>${esc(t.description)}</div>` : ""}
  </div>
  <div class="card" style="margin-top:16px"><div class="table-wrap"><table class="tbl"><thead><tr><th>م</th><th>المورد</th><th>المدينة</th><th>رأس المال</th><th>نسبة الاستخدام</th><th>مسؤول التواصل</th><th>الهاتف</th><th>البريد</th></tr></thead><tbody>
    ${t.invitations.map((i, n) => `<tr><td class="num">${n + 1}</td><td class="name"><a href="#/suppliers/${i.supplierId}">${esc(i.nameAr)}</a><div class="muted small"><span class="num">${i.code}</span></div></td><td>${esc(i.city)}</td><td class="nowrap">${money(i.capital)}</td><td>${pct(i.capitalUtilization)}</td><td>${esc(i.contactPerson)}</td><td class="num nowrap">${esc(i.phone)}</td><td class="small">${esc(i.email)}</td></tr>`).join("")}
  </tbody></table></div></div>
  <p class="muted small">أُصدرت القائمة بواسطة ${esc(t.createdBy)} بتاريخ <span class="num">${fdt(t.createdAt)}</span> — جميع الموردين المدرجين اجتازوا قواعد الأهلية BR-01 → BR-04 عند الإصدار.</p>
  <div class="print-only sign-row"><div>إعداد: مسؤول المشتريات<br><br>التوقيع: ..................</div><div>اعتماد: إدارة الفرع<br><br>التوقيع: ..................</div></div>`;
}

/** تصدير PDF عبر نافذة الطباعة في المتصفح (اختر «حفظ كـ PDF»). */
function printPdf() {
  toast("في نافذة الطباعة اختر «حفظ كـ PDF» (Save as PDF)");
  setTimeout(() => window.print(), 350);
}

// ============================================================ سجل التدقيق
async function renderAudit() {
  crumbs("الحوكمة", "سجل التدقيق");
  view().innerHTML = `
  <div class="page-head"><div><h1>سجل التدقيق</h1><p>سجل مُسلسل بسلسلة تجزئة SHA-256؛ أي تعديل مباشر على قاعدة البيانات يكسر السلسلة ويُكتشف فوراً.</p></div>
    <button class="btn btn-primary" id="verify">⛓ التحقق من سلامة السجل</button></div>
  <div id="verifyBox"></div>
  <div class="card"><div class="card-head"><input class="input" id="aQ" placeholder="🔍 بحث في التفاصيل أو المستخدم" style="max-width:360px"></div><div id="aTable"></div></div>`;
  const load = async () => {
    const rows = await api("GET", "/api/audit?" + new URLSearchParams({ q: $("#aQ").value, take: 500 }));
    $("#aTable").innerHTML = `<div class="table-wrap"><table class="tbl"><thead><tr><th>#</th><th>الوقت</th><th>المستخدم</th><th>الإجراء</th><th>التفاصيل</th><th>البصمة</th></tr></thead><tbody>
      ${rows.map(a => `<tr><td class="num muted">${a.id}</td><td class="num small nowrap">${fdt(a.timestamp)}</td><td class="small">${esc(a.user)}<div class="muted">${ROLE_NAME[a.role] || a.role}</div></td><td><span class="badge no-dot">${esc(a.action)}</span></td>
        <td class="small">${a.entity === "Supplier" && a.entityId ? `<a href="#/suppliers/${a.entityId}">${esc(a.details)}</a>` : a.entity === "Tender" ? `<a href="#/tenders/${a.entityId}">${esc(a.details)}</a>` : esc(a.details)}</td>
        <td><code class="small muted" title="${a.hash}">${a.hash.slice(0, 10)}…</code></td></tr>`).join("")}
    </tbody></table></div>`;
  };
  $("#aQ").oninput = debounce(load);
  $("#verify").onclick = async () => {
    const v = await api("GET", "/api/audit/verify");
    $("#verifyBox").innerHTML = `<div class="callout ${v.ok ? "ok" : "danger"}" style="margin-bottom:16px">${v.ok ? `✓ السلسلة سليمة — تم التحقق من <b class="num">${v.count}</b> سجل دون أي عبث.` : `✕ تم اكتشاف عبث في السجل رقم <b class="num">${v.brokenAt}</b>!`}</div>`;
  };
  await load();
}

// ============================================================ الإعدادات
/** حقل رقمي مع وحدة منفصلة عنه (د.ل / % / يوم) حتى لا تتداخل الوحدة مع الرقم. */
const unitField = (id, label, value, unit, can, extra = "") => `
  <div class="uf"><label class="lbl" for="${id}">${label}</label>
    <div class="unit-field ${can ? "" : "is-locked"}"><input class="input" dir="ltr" id="${id}" value="${value}" ${extra} ${can ? "" : "disabled"}><span class="unit">${unit}</span></div>
    <div class="hint" id="${id}w"></div></div>`;

async function renderSettings() {
  crumbs("الإدارة", "معايير التصنيف والأهلية");
  const s = await api("GET", "/api/settings");
  const can = user.role === "Admin";
  view().innerHTML = `
  <div class="page-head"><div><h1>معايير التصنيف والأهلية</h1><p>المعايير قابلة للتعديل (FR-02) وتُسجل كل التغييرات في سجل التدقيق.</p></div></div>
  ${can ? "" : `<div class="callout warn" style="margin-bottom:16px">العرض فقط. تعديل المعايير متاح لدور «مدير النظام».</div>`}
  <div class="settings-grid">
    <div class="card"><div class="card-head"><h2>حدود الفئات حسب رأس المال</h2></div><div class="card-body stack">
      ${unitField("sA", "الحد الأدنى لفئة (أ) — كبرى", nf.format(s.tierAMin), "د.ل", can, 'inputmode="numeric"')}
      ${unitField("sB", "الحد الأدنى لفئة (ب) — متوسطة", nf.format(s.tierBMin), "د.ل", can, 'inputmode="numeric"')}
      ${unitField("sC", "الحد الأدنى لفئة (ج) — صغرى", nf.format(s.tierCMin), "د.ل", can, 'inputmode="numeric"')}
    </div></div>
    <div class="card"><div class="card-head"><h2>المدى الناتج لكل فئة</h2></div><div class="card-body"><div class="tier-ladder" id="ladder"></div></div></div>
    <div class="card"><div class="card-head"><h2>قواعد الأهلية والتنبيه</h2></div><div class="card-body stack">
      ${unitField("sR", "أقصى نسبة لقيمة المناقصة من رأس المال (BR-04)", Math.round(s.maxTenderToCapitalRatio * 100), "%", can, 'type="number" min="1" max="100"')}
      ${unitField("sD", "التنبيه قبل انتهاء الوثائق بـ", s.expiryWarningDays, "يوم", can, 'type="number" min="1" max="365"')}
    </div></div>
  </div>
  <div class="field-err" id="sErr"></div>
  ${can ? `<div class="row" style="margin-top:16px"><button class="btn btn-primary" id="sSave">💾 حفظ المعايير</button></div>` : ""}`;
  const val = id => parseAmount($(id).value);
  const ladder = () => {
    const A = val("#sA"), B = val("#sB"), C = val("#sC"), ok = A > B && B > C && C > 0;
    const row = (t, range) => `<div class="tl-row">${tierBadge(t)}<div><b>${TIER_NAME[t]}</b><div class="tl-range">${range}</div></div></div>`;
    $("#ladder").innerHTML = !ok ? `<div class="callout warn">يجب أن يكون حد (أ) أكبر من (ب)، وحد (ب) أكبر من (ج).</div>` :
      row("A", `${moneyTxt(A)} فأكثر`) +
      row("B", `من ${moneyTxt(B)} إلى أقل من ${moneyTxt(A)}`) +
      row("C", `من ${moneyTxt(C)} إلى أقل من ${moneyTxt(B)}`) +
      row("U", `أقل من ${moneyTxt(C)} · لا يُرشح للمناقصات`) +
      `<div class="hint" style="margin-top:8px">مثال: مناقصة بقيمة ${moneyTxt(B * Number($("#sR").value || 50) / 100)} تحتاج رأس مال لا يقل عن ${moneyTxt(B)}.</div>`;
  };
  ["#sA", "#sB", "#sC"].forEach(id => can ? bindAmount($(id), v => { $(id + "w").textContent = amountWords(v); ladder(); }) : ($(id + "w").textContent = amountWords(val(id))));
  $("#sR").oninput = ladder;
  ladder();
  if (!can) return;
  $("#sSave").onclick = async () => {
    $("#sErr").textContent = "";
    try {
      const r = await api("PUT", "/api/settings", { tierAMin: val("#sA"), tierBMin: val("#sB"), tierCMin: val("#sC"), maxTenderToCapitalRatio: Number($("#sR").value) / 100, expiryWarningDays: Number($("#sD").value) });
      state.meta.settings = r; toast("تم حفظ المعايير");
    } catch (e) { $("#sErr").textContent = errText(e); }
  };
}

// ============================================================ إدارة المستخدمين
const pwField = (id, label, auto) => `<div><label class="lbl" for="${id}">${label}</label><input class="input" id="${id}" type="password" dir="ltr" autocomplete="${auto}"></div>`;

/** تغيير كلمة المرور: إلزامي بعد كلمة مرور مؤقتة، أو اختياري من شريط المستخدم. */
function changePasswordDialog(forced, currentPw = "") {
  const body = `${forced ? `<div class="callout warn" style="margin-bottom:12px">هذه كلمة مرور مؤقتة. اختر كلمة مرور جديدة لإكمال الدخول.</div>` : ""}
    <div class="stack">
      ${forced ? "" : pwField("cpOld", "كلمة المرور الحالية", "current-password")}
      ${pwField("cpNew", "كلمة المرور الجديدة", "new-password")}
      ${pwField("cpNew2", "تأكيد كلمة المرور الجديدة", "new-password")}
      <div class="hint">8 أحرف على الأقل، وتحتوي حرفاً ورقماً.</div>
      <div class="field-err" id="cpErr" role="alert"></div></div>`;
  const run = async root => {
    const n = $("#cpNew", root).value, n2 = $("#cpNew2", root).value, err = $("#cpErr", root);
    if (n !== n2) { err.textContent = "كلمتا المرور غير متطابقتين"; return false; }
    try {
      await api("POST", "/api/auth/change-password", { employeeNo: user.employeeNo, currentPassword: forced ? currentPw : $("#cpOld", root).value, newPassword: n });
      if (forced) { session.mustChangePassword = false; setSession(session); toast(`مرحباً ${user.name}`); enterApp(); }
      else toast("تم تغيير كلمة المرور");
    } catch (e) { err.textContent = errText(e); return false; }
  };
  const m = modal({ title: "تغيير كلمة المرور", body, actions: forced ? [{ label: "إلغاء الدخول", onClick: () => { setSession(null); renderLogin(); } }, { label: "حفظ ومتابعة", cls: "btn-primary", onClick: run }] : [{ label: "إلغاء" }, { label: "حفظ", cls: "btn-primary", onClick: run }] });
  if (forced) $("[data-x]", m.root).onclick = () => { m.close(); setSession(null); renderLogin(); };
}

/** يعرض كلمة المرور المؤقتة مرة واحدة ليسلّمها المدير للموظف. */
function showTempPassword(u, pw, isNew) {
  modal({
    title: isNew ? "تمت إضافة المستخدم" : "تمت إعادة تعيين كلمة المرور",
    body: `<p>سلّم الموظف <b>${esc(u.fullName)}</b> بيانات الدخول التالية. ستظهر كلمة المرور المؤقتة هذه المرة فقط، وسيُطلب منه تغييرها عند أول دخول.</p>
      <div class="cred-box"><div><span class="muted small">الرقم الوظيفي</span><b dir="ltr" class="num">${esc(u.employeeNo)}</b></div>
      <div><span class="muted small">البريد</span><b dir="ltr">${esc(u.email)}</b></div>
      <div><span class="muted small">كلمة المرور المؤقتة</span><b dir="ltr" class="num" id="tmpPw">${esc(pw)}</b></div></div>`,
    actions: [{ label: "إغلاق" }, { label: "📋 نسخ بيانات الدخول", cls: "btn-primary", onClick: async () => {
      const text = `الرقم الوظيفي: ${u.employeeNo}\nالبريد: ${u.email}\nكلمة المرور المؤقتة: ${pw}`;
      try { await navigator.clipboard.writeText(text); toast("تم النسخ"); } catch { const r = document.createRange(); r.selectNodeContents($("#tmpPw")); getSelection().removeAllRanges(); getSelection().addRange(r); toast("حدد النص وانسخه يدوياً", true); return false; }
    } }]
  });
}

async function renderUsers() {
  crumbs("الإدارة", "إدارة المستخدمين");
  if (user.role !== "Admin") { view().innerHTML = `<div class="callout warn">إدارة المستخدمين متاحة لدور «مدير النظام» فقط.</div>`; return; }
  const f = { q: "", role: "", status: "" };
  view().innerHTML = `
  <div class="page-head"><div><h1>إدارة المستخدمين</h1><p>إضافة الموظفين وتحديد أدوارهم، وإيقاف الحسابات، وإعادة تعيين كلمات المرور. كل تغيير يُسجل في سجل التدقيق.</p></div>
    <button class="btn btn-primary" id="uAdd">＋ إضافة مستخدم</button></div>
  <div class="grid g4" id="uKpi" style="margin-bottom:16px"></div>
  <div class="card"><div class="card-head" style="flex-wrap:wrap">
    <input class="input" id="uQ" placeholder="🔍 بحث بالاسم أو الرقم الوظيفي أو البريد" style="flex:2;min-width:220px">
    <select class="select" id="uRole" style="flex:1;min-width:150px"><option value="">كل الأدوار</option>${Object.entries(ROLE_NAME).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>
    <select class="select" id="uStatus" style="flex:1;min-width:130px"><option value="">كل الحالات</option><option value="active">نشط</option><option value="inactive">موقوف</option><option value="pending">بانتظار تغيير كلمة المرور</option></select>
  </div><div id="uTable"></div></div>`;
  let all = [];
  const load = async () => { all = await api("GET", "/api/users"); draw(); };
  const draw = () => {
    const q = f.q.trim().toLowerCase();
    const rows = all.filter(u => (!q || [u.fullName, u.employeeNo, u.email].some(v => v.toLowerCase().includes(q)))
      && (!f.role || u.role === f.role)
      && (!f.status || (f.status === "active" ? u.isActive : f.status === "inactive" ? !u.isActive : u.mustChangePassword)));
    const kpi = (label, v, cls = "") => `<div class="card kpi ${cls}"><div class="k-label">${label}</div><div class="k-value num">${v}</div></div>`;
    $("#uKpi").innerHTML = kpi("إجمالي المستخدمين", all.length) + kpi("نشط", all.filter(u => u.isActive).length, "ok") + kpi("موقوف", all.filter(u => !u.isActive).length, all.some(u => !u.isActive) ? "danger" : "") + kpi("بانتظار تغيير كلمة المرور", all.filter(u => u.mustChangePassword).length);
    $("#uTable").innerHTML = `<div class="table-wrap"><table class="tbl"><thead><tr><th>الموظف</th><th>الرقم الوظيفي</th><th>البريد الإلكتروني</th><th>الدور</th><th>الحالة</th><th>آخر دخول</th><th>الإجراءات</th></tr></thead><tbody>
      ${rows.length ? rows.map(u => `<tr>
        <td><div class="u-cell"><span class="avatar sm">${esc(u.fullName.trim()[0] || "م")}</span><span class="name">${esc(u.fullName)}</span>${u.employeeNo === user.employeeNo ? `<span class="badge no-dot">أنت</span>` : ""}</div></td>
        <td><span class="num">${esc(u.employeeNo)}</span></td><td class="small"><span dir="ltr">${esc(u.email)}</span></td>
        <td>${ROLE_NAME[u.role] || u.role}</td>
        <td>${u.isActive ? `<span class="badge b-ok">نشط</span>` : `<span class="badge b-danger">موقوف</span>`}${u.mustChangePassword ? `<div class="muted small">بانتظار تغيير كلمة المرور</div>` : ""}</td>
        <td class="small nowrap">${u.lastLoginAt ? `<span class="num">${fdt(u.lastLoginAt)}</span>` : `<span class="muted">لم يدخل بعد</span>`}</td>
        <td class="nowrap"><button class="btn btn-sm" data-edit="${u.id}">✎ تعديل</button> <button class="btn btn-sm btn-ghost" data-reset="${u.id}">🔑 إعادة تعيين</button></td></tr>`).join("")
        : `<tr><td colspan="7" class="empty">لا يوجد مستخدمون مطابقون</td></tr>`}
    </tbody></table></div>`;
    $$("[data-edit]").forEach(b => b.onclick = () => userForm(all.find(u => u.id === +b.dataset.edit)));
    $$("[data-reset]").forEach(b => b.onclick = () => {
      const u = all.find(x => x.id === +b.dataset.reset);
      modal({ title: "إعادة تعيين كلمة المرور", body: `<p>سيتم إنشاء كلمة مرور مؤقتة جديدة للموظف <b>${esc(u.fullName)}</b>، ولن تعمل كلمة المرور الحالية بعد ذلك.</p>`,
        actions: [{ label: "إلغاء" }, { label: "🔑 إعادة التعيين", cls: "btn-primary", onClick: async () => {
          try { const r = await api("POST", `/api/users/${u.id}/reset-password`); await load(); setTimeout(() => showTempPassword(u, r.temporaryPassword, false), 0); } catch (e) { toast(errText(e), true); }
        } }] });
    });
  };
  const userForm = u => {
    const isNew = !u, v = u || { fullName: "", employeeNo: "", email: "", role: "Procurement", isActive: true };
    const body = `<div class="form-grid">
      <div class="span2"><label class="lbl" for="ufName">الاسم الكامل *</label><input class="input" id="ufName" value="${esc(v.fullName)}"><div class="field-err" data-err="FullName"></div></div>
      <div><label class="lbl" for="ufEmp">الرقم الوظيفي *</label><input class="input" id="ufEmp" dir="ltr" inputmode="numeric" value="${esc(v.employeeNo)}"><div class="field-err" data-err="EmployeeNo"></div></div>
      <div><label class="lbl" for="ufEmail">البريد الإلكتروني *</label><input class="input" id="ufEmail" dir="ltr" type="email" value="${esc(v.email)}"><div class="field-err" data-err="Email"></div></div>
      <div><label class="lbl" for="ufRole">الدور *</label><select class="select" id="ufRole">${Object.entries(ROLE_NAME).map(([k, n]) => `<option value="${k}" ${k === v.role ? "selected" : ""}>${n}</option>`).join("")}</select><div class="field-err" data-err="Role"></div></div>
      <div><label class="lbl">حالة الحساب</label><label class="check" style="margin-top:10px"><input type="checkbox" id="ufActive" ${v.isActive ? "checked" : ""}> الحساب نشط ويمكنه الدخول</label></div>
    </div>
    ${isNew ? `<div class="callout info" style="margin-top:12px">ستُنشأ كلمة مرور مؤقتة تظهر لك بعد الحفظ، ويغيّرها الموظف عند أول دخول.</div>` : ""}
    <div class="field-err" id="ufErr" role="alert"></div>`;
    modal({ title: isNew ? "إضافة مستخدم" : `تعديل: ${esc(v.fullName)}`, body, actions: [{ label: "إلغاء" }, { label: isNew ? "＋ إضافة" : "💾 حفظ", cls: "btn-primary", onClick: async root => {
      $$("[data-err]", root).forEach(e => e.textContent = ""); $("#ufErr", root).textContent = "";
      const input = { fullName: $("#ufName", root).value, employeeNo: $("#ufEmp", root).value.replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d)), email: $("#ufEmail", root).value, role: $("#ufRole", root).value, isActive: $("#ufActive", root).checked };
      try {
        if (isNew) { const r = await api("POST", "/api/users", input); await load(); setTimeout(() => showTempPassword(r.user, r.temporaryPassword, true), 0); }
        else { await api("PUT", `/api/users/${u.id}`, input); toast("تم حفظ بيانات المستخدم"); await load(); }
      } catch (e) {
        const keys = Object.keys(e.errors || {});
        keys.forEach(k => { const el = $(`[data-err="${k}"]`, root); if (el) el.textContent = [].concat(e.errors[k]).join(" "); });
        if (!keys.length) $("#ufErr", root).textContent = errText(e);
        return false;
      }
    } }], wide: true });
  };
  $("#uAdd").onclick = () => userForm(null);
  $("#uQ").oninput = debounce(e => { f.q = $("#uQ").value; draw(); }, 150);
  $("#uRole").onchange = e => { f.role = e.target.value; draw(); };
  $("#uStatus").onchange = e => { f.status = e.target.value; draw(); };
  await load();
}

// ============================================================ التشغيل
async function boot() {
  state.meta = await api("GET", "/api/meta");
  $("#menuBtn").onclick = () => $("#sidebar").classList.toggle("open");
  window.addEventListener("hashchange", () => session && router());
  if (session && !session.mustChangePassword) enterApp(); else { setSession(null); renderLogin(); }
}

function enterApp() {
  $("#loginRoot").innerHTML = "";
  document.body.classList.remove("logged-out");
  $("#userBox").innerHTML = `<div class="user-chip"><span class="avatar">${esc(user.name.trim()[0] || "م")}</span>
    <span class="u-meta"><b>${esc(user.name)}</b><span class="muted small">${ROLE_NAME[user.role]} · رقم وظيفي <span class="num">${esc(user.employeeNo)}</span></span></span></div>
    <button class="btn btn-sm btn-ghost" id="pwBtn" title="تغيير كلمة المرور">🔑 كلمة المرور</button>
    <button class="btn btn-sm btn-ghost" id="logoutBtn">تسجيل الخروج</button>`;
  $$("[data-admin]").forEach(a => a.hidden = user.role !== "Admin");
  $("#logoutBtn").onclick = () => { setSession(null); toast("تم تسجيل الخروج"); renderLogin(); };
  $("#pwBtn").onclick = () => changePasswordDialog(false);
  router();
}

/** شاشة الدخول: البريد الإلكتروني أو الرقم الوظيفي + كلمة المرور. */
async function renderLogin() {
  document.body.classList.add("logged-out");
  let demo = [];
  try { demo = await api("GET", "/api/auth/demo-users"); } catch { }
  $("#loginRoot").innerHTML = `<div class="login-page"><form class="login-card" id="loginForm" novalidate>
    <div class="brand"><div class="brand-mark">م</div><div><div class="brand-title">منظومة الموردين</div><div class="brand-sub">إدارة وتأهيل وترشيح</div></div></div>
    <h1>تسجيل الدخول</h1>
    <p class="muted">ادخل بالبريد الإلكتروني أو بالرقم الوظيفي.</p>
    <div><label class="lbl" for="lgId">البريد الإلكتروني أو الرقم الوظيفي</label><input class="input" id="lgId" dir="ltr" autocomplete="username" placeholder="name@company.ly أو 1001"><div class="hint" id="lgKind"></div></div>
    <div><label class="lbl" for="lgPw">كلمة المرور</label><input class="input" id="lgPw" type="password" dir="ltr" autocomplete="current-password"></div>
    <div class="field-err" id="lgErr" role="alert"></div>
    <button class="btn btn-primary" type="submit" id="lgBtn">دخول</button>
    ${demo.length ? `<div class="demo-box"><div class="small"><b>حسابات تجريبية</b> · كلمة المرور <code dir="ltr">Demo@123</code> · اضغط على حساب لتعبئته</div>
      <div class="demo-list">${demo.map(u => `<button type="button" class="demo-acc" data-id="${esc(u.employeeNo)}"><b>${ROLE_NAME[u.role]}</b><span class="muted small">${esc(u.fullName)} · <span class="num">${esc(u.employeeNo)}</span> · <span dir="ltr">${esc(u.email)}</span></span></button>`).join("")}</div></div>` : ""}
  </form></div>`;
  const idIn = $("#lgId"), pwIn = $("#lgPw");
  const kind = () => $("#lgKind").textContent = !idIn.value.trim() ? "" : idIn.value.includes("@") ? "سيتم الدخول بالبريد الإلكتروني" : /^\d+$/.test(idIn.value.trim()) ? "سيتم الدخول بالرقم الوظيفي" : "أدخل بريداً صحيحاً أو رقماً وظيفياً من أرقام فقط";
  idIn.oninput = kind;
  $$(".demo-acc").forEach(b => b.onclick = () => { idIn.value = b.dataset.id; pwIn.value = "Demo@123"; kind(); $("#lgBtn").focus(); });
  idIn.focus();
  $("#loginForm").onsubmit = async e => {
    e.preventDefault();
    $("#lgErr").textContent = "";
    try {
      const u = await api("POST", "/api/auth/login", { identifier: idIn.value, password: pwIn.value });
      setSession(u);
      if (u.mustChangePassword) { changePasswordDialog(true, pwIn.value); return; }
      toast(`مرحباً ${u.fullName}`); enterApp();
    } catch (err) { $("#lgErr").textContent = errText(err); pwIn.select(); }
  };
}
boot().catch(e => { view().innerHTML = `<div class="callout danger">تعذر الاتصال بالخادم: ${esc(e.message)}</div>`; });
