# تعليمات العمل على هذا المستودع

- لغة الشرح والردود: العربية.
- الكود المصدري للمنظومة (.NET 8 Minimal API + واجهة JavaScript) في `src/SupplierSystem`.
- `index.html` في جذر المستودع هو نسخة HTML المنشورة على GitHub Pages:
  https://wennasa.github.io/Suppliers-Management-System/
  لا تعدّله يدوياً؛ يُولَّد من الكود.

## بعد أي تعديل على الواجهة أو قواعد العمل
1. عدّل الكود في `src/SupplierSystem` (الواجهة في `wwwroot`، والقواعد في `Services` و`Endpoints`).
2. انقل التعديل نفسه إلى `tools/html-build/backend.js` إذا كان يمس قواعد العمل أو واجهة API،
   لأن نسخة HTML تعمل بدون خادم وتحاكي الـ API داخل المتصفح.
3. أعد بناء نسخة HTML:
   `python3 tools/html-build/build.py src/SupplierSystem tools/html-build standalone index.html`
4. تحقق من البناء: `dotnet build src/SupplierSystem`.
5. ارفع التعديلات إلى `main` ليتحدث رابط GitHub Pages تلقائياً.

## قواعد مهمة
- لا ترفع `bin/` أو `obj/` أو `App_Data/` (قاعدة البيانات التجريبية).
- البيانات تجريبية؛ لا تُدخل بيانات موردين حقيقية في المستودع العام.
