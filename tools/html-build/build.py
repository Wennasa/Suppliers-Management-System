"""
يبني نسخة HTML من المنظومة (ملف واحد يعمل في المتصفح بدون خادم) من كود .NET.

الاستخدام (من جذر المستودع):
    python3 tools/html-build/build.py src/SupplierSystem tools/html-build standalone index.html

- standalone: ملف كامل لـ GitHub Pages أو للإرسال (التصدير إلى Excel وPDF يعمل).
- artifact: نسخة لصفحات كلود (بدون تنزيل أو طباعة).
الملفات: backend.js (محاكاة واجهة API وقواعد العمل في المتصفح)، xlsx.js (مولّد Excel).
"""
import re, sys, pathlib
proj = pathlib.Path(sys.argv[1]); web = pathlib.Path(sys.argv[2])
MODE = sys.argv[3] if len(sys.argv) > 3 else "artifact"   # artifact | standalone
OUT = pathlib.Path(sys.argv[4]) if len(sys.argv) > 4 else web / "index.html"
xlsxjs = (web / "xlsx.js").read_text(encoding="utf8")
js = (proj / "wwwroot/js/app.js").read_text(encoding="utf8")
css = (proj / "wwwroot/css/app.css").read_text(encoding="utf8")
html = (proj / "wwwroot/index.html").read_text(encoding="utf8")
backend = (web / "backend.js").read_text(encoding="utf8")

def must(old, new, count=1):
    global js
    n = js.count(old)
    assert n == count, (old[:70], n)
    js = js.replace(old, new)

# 1) إزالة دالة api الخاصة بالخادم (يوفرها المحرك المحلي)
a = js.index("async function api(method, url, body, isForm)")
b = js.index("const errText")
js = js[:a] + js[b:]

# 2) مسارات الصفحة: #name فقط (قيد المنصة)، و settings محجوزة
must("""  [/^#\\/dashboard$/, renderDashboard, "dashboard"],
  [/^#\\/match$/, renderMatch, "match"],
  [/^#\\/suppliers$/, renderSuppliers, "suppliers"],
  [/^#\\/suppliers\\/new$/, () => renderWizard(null), "new"],
  [/^#\\/suppliers\\/(\\d+)\\/edit$/, m => renderWizard(+m[1]), "suppliers"],
  [/^#\\/suppliers\\/(\\d+)$/, m => renderProfile(+m[1]), "suppliers"],
  [/^#\\/tenders$/, renderTenders, "tenders"],
  [/^#\\/tenders\\/(\\d+)$/, m => renderTender(+m[1]), "tenders"],
  [/^#\\/audit$/, renderAudit, "audit"],
  [/^#\\/settings$/, renderSettings, "settings"],
  [/^#\\/users$/, renderUsers, "users"],""",
"""  [/^#dashboard$/, renderDashboard, "dashboard"],
  [/^#match$/, renderMatch, "match"],
  [/^#suppliers$/, renderSuppliers, "suppliers"],
  [/^#new$/, () => renderWizard(null), "new"],
  [/^#supplier-(\\d+)-edit$/, m => renderWizard(+m[1]), "suppliers"],
  [/^#supplier-(\\d+)$/, m => renderProfile(+m[1]), "suppliers"],
  [/^#tenders$/, renderTenders, "tenders"],
  [/^#tender-(\\d+)$/, m => renderTender(+m[1]), "tenders"],
  [/^#audit$/, renderAudit, "audit"],
  [/^#criteria$/, renderSettings, "settings"],
  [/^#users$/, renderUsers, "users"],""")
js = re.sub(r"#/suppliers/new", "#new", js)
js = re.sub(r"#/suppliers/(\$\{[^}]+\})/edit", r"#supplier-\1-edit", js)
js = re.sub(r"#/suppliers/(\$\{[^}]+\})", r"#supplier-\1", js)
js = re.sub(r"#/tenders/(\$\{[^}]+\})", r"#tender-\1", js)
for a_, b_ in [("#/suppliers", "#suppliers"), ("#/tenders", "#tenders"), ("#/match", "#match"), ("#/dashboard", "#dashboard"), ("#/audit", "#audit"), ("#/settings", "#criteria"), ("#/users", "#users")]:
    js = js.replace(a_, b_)
assert "#/" not in js, js[js.index("#/")-80: js.index("#/")+40]

# 3) التصدير والطباعة والوثائق (المنصة تمنع التنزيل والطباعة وconfirm)
must('<a class="btn" href="/api/suppliers/export.xlsx">⬇ Excel</a>', '<button class="btn" onclick="exportX(\'suppliers\')">⬇ Excel</button>')
must('<a class="btn" href="/api/tenders/export.xlsx">⬇ Excel</a>', '<button class="btn" onclick="exportX(\'tenders\')">⬇ Excel</button>')
must('<a class="btn" href="/api/tenders/${id}/export.xlsx">⬇ Excel</a>', '<button class="btn" onclick="exportX(\'tender\', ${id})">⬇ Excel</button>')
must('<a class="btn btn-sm" href="/api/eligibility/export.xlsx?${xq}">⬇ Excel</a>', '<button class="btn btn-sm" onclick="exportX(\'elig\')">⬇ Excel</button>')
if MODE == "artifact":
    must('\n        <button class="btn" onclick="window.print()">🖨 طباعة</button>', '')
must('<a class="badge b-info no-dot" href="/api/documents/${d.id}" target="_blank">📎 ${esc(d.fileName)}</a>',
     '<button type="button" class="badge b-info no-dot" style="cursor:pointer;font-family:inherit" onclick="previewDoc(${d.id})">📎 ${esc(d.fileName)}</button>')
must('<a href="/api/documents/${d.id}" target="_blank">${esc(d.fileName)}</a>',
     '<a href="#" onclick="event.preventDefault();previewDoc(${d.id})">${esc(d.fileName)}</a>')
must("""    if (!confirm("حذف هذه الوثيقة؟")) return;
    try { await api("DELETE", `/api/documents/${b.dataset.deldoc}`); toast("تم حذف الوثيقة"); router(); } catch (e) { toast(errText(e), true); }""",
"""    modal({ title: "حذف الوثيقة", body: "سيتم حذف هذه الوثيقة من ملف المورد.", actions: [{ label: "إلغاء" }, { label: "🗑 حذف", cls: "btn-danger", onClick: async () => {
      try { await api("DELETE", `/api/documents/${b.dataset.deldoc}`); toast("تم حذف الوثيقة"); router(); } catch (e) { toast(errText(e), true); } } }] });""")
must('const hash = location.hash || "#match";\n  if (!location.hash) { history.replaceState(null, "", "#match"); }',
     'const hash = location.hash || "#match";')

extras = r'''
// ============================================================ أدوات النسخة السحابية
/** تصدير Excel: في الملف المستقل يُنزَّل ملف ‎.xlsx، وفي الصفحة السحابية يُنسخ الجدول للصقه في Excel. */
function exportX(kind, arg) {
  const t = exportTable(kind, arg);
  if (!t) { toast("لا توجد بيانات للتصدير", true); return; }
  if (STANDALONE) { downloadBlob(buildXlsx(t), t.file + ".xlsx"); toast("تم تنزيل ملف Excel"); return; }
  modal({
    title: t.title, wide: true,
    body: `<p class="muted">الصفحة السحابية لا تسمح بتنزيل الملفات. اضغط «نسخ» ثم الصق في Excel (Ctrl+V) فتتوزع الأعمدة تلقائياً. لتنزيل ملف ‎.xlsx مباشرة استخدم نسخة HTML المحمّلة على جهازك.</p><textarea class="input" id="csvText" rows="14" dir="rtl" readonly style="font-size:12.5px">${esc(tableTsv(t))}</textarea>`,
    actions: [{ label: "إغلاق" }, { label: "📋 نسخ", cls: "btn-primary", onClick: async root => {
      const ta = $("#csvText", root);
      try { await navigator.clipboard.writeText(ta.value); toast("تم النسخ"); } catch { ta.focus(); ta.select(); toast("حدد النص واضغط Ctrl+C", true); return false; }
    } }]
  });
}
if (!STANDALONE) printPdf = function () {
  modal({ title: "تصدير PDF", body: `<div class="callout info">الصفحة السحابية لا تسمح بفتح نافذة الطباعة. لحفظ PDF افتح نسخة HTML المحمّلة على جهازك واضغط زر PDF، ثم اختر «حفظ كـ PDF».</div>`, actions: [{ label: "حسناً" }] });
};
function previewDoc(id) {
  const d = DB.documents.find(x => x.id === id), data = FILES[id];
  if (!d) return;
  const body = data && /^data:image\//.test(data) ? `<img src="${data}" alt="${esc(d.fileName)}" style="max-width:100%;border-radius:8px;border:1px solid var(--border)">`
    : `<div class="callout info">${data ? "معاينة ملفات PDF غير متاحة داخل هذه الصفحة. الملف محفوظ في متصفحك." : (d.sample ? "مستند تجريبي: مسجل كبيانات فقط للعرض." : "تم تسجيل بيانات الوثيقة فقط؛ في النسخة السحابية التجريبية تُحفظ الملفات حتى 1.5 ميغابايت.")}</div>`;
  modal({ title: esc(d.fileName), body: `${body}<p class="muted small">${(d.size / 1024).toFixed(0)} KB · ${esc(d.uploadedBy || "")} · <span class="num">${fdt(d.uploadedAt)}</span></p>`, actions: [{ label: "إغلاق" }] });
}
function resetDemo() {
  modal({ title: "إعادة تهيئة البيانات", body: `<div class="callout warn">سيتم حذف كل ما أدخلته في هذا المتصفح (موردون، مناقصات، وثائق، سجل التدقيق) والعودة إلى الموردين الثلاثين التجريبيين.</div>`,
    actions: [{ label: "إلغاء" }, { label: "↺ إعادة التهيئة", cls: "btn-danger", onClick: async () => { await initDb(true); toast("تمت إعادة تهيئة البيانات"); state.meta = await api("GET", "/api/meta"); router(); } }] });
}
'''
js = js.replace("// ============================================================ التشغيل", extras + "\n// ============================================================ التشغيل")

# 4) الصفحة
body = html[html.index("<body>") + 6: html.index("<script")]
for a_, b_ in [('href="#/dashboard"', 'href="#dashboard"'), ('href="#/match"', 'href="#match"'), ('href="#/suppliers/new"', 'href="#new"'), ('href="#/suppliers"', 'href="#suppliers"'), ('href="#/tenders"', 'href="#tenders"'), ('href="#/audit"', 'href="#audit"'), ('href="#/settings"', 'href="#criteria"'), ('href="#/users"', 'href="#users"')]:
    assert a_ in body, a_
    body = body.replace(a_, b_)
body = body.replace('<div class="sidebar-foot">الإصدار 4.0 · .NET 8</div>',
  '<div class="sidebar-foot"><div>' + ('نسخة HTML تجريبية' if MODE == 'standalone' else 'نسخة سحابية تجريبية') + ' · البيانات محفوظة في متصفحك</div><button class="btn btn-sm" style="margin-top:8px;background:transparent;color:inherit;border-color:rgba(255,255,255,.25)" onclick="resetDemo()">↺ إعادة تهيئة البيانات</button></div>')

css += """
/* ---- تكييف المنصة ---- */
:root { color-scheme: light; }
body { background: var(--bg); color: var(--text); }
.topbar { top: env(safe-area-inset-top, 0px); }
.sidebar { height: 100dvh; }
.sidebar-foot { opacity: .75; line-height: 1.5; }
.view { padding-left: max(24px, env(safe-area-inset-left, 0px)); padding-right: max(24px, env(safe-area-inset-right, 0px)); }
.toasts { bottom: calc(20px + env(safe-area-inset-bottom, 0px)); left: calc(20px + env(safe-area-inset-left, 0px)); }
:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
@media (max-width: 760px) { .view { padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); } }
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
"""

script = f"const STANDALONE = {'true' if MODE == 'standalone' else 'false'};\n{xlsxjs}\n{backend}\n{js}"
head = f'''<title>منظومة إدارة وتأهيل الموردين</title>
<meta name="description" content="إدارة وتأهيل الموردين وترشيحهم للمناقصات">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
{css}
</style>'''
if MODE == "standalone":
    out = f'''<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
{head}
</head>
<body>
{body}
<script>
{script}
</script>
</body>
</html>
'''
else:
    out = f'''{head}
<div dir="rtl" lang="ar">
{body}
</div>
<script>
{script}
</script>
'''
OUT.write_text(out, encoding="utf8")
print("ok", MODE, len(out))
