# رفع Lumira على Netlify

هذه النسخة مهيأة للعمل على Netlify:
- الواجهة (HTML/CSS/JS) في مجلد `public/`.
- الخادم صار **Netlify Functions** في `netlify/functions/api.mjs`، والمنطق في `netlify/lib/shop.mjs`.
- البيانات (المنتجات، السلات، الطلبات، الرسائل) محفوظة في **Netlify Blobs**.

## الطريقة الموصى بها (Git)
1. ارفع المجلد إلى مستودع GitHub جديد.
2. في Netlify: **Add new site → Import an existing project** واختر المستودع.
3. الإعدادات تُقرأ تلقائيًا من `netlify.toml` (Publish: `public`, Functions: `netlify/functions`).
4. Netlify يثبّت الحزم من `package.json` (يحتاج `@netlify/blobs`) ثم ينشر الموقع.

## أو بسطر الأوامر
```
npm install
npx netlify-cli login
npx netlify-cli deploy --build --prod
```

## ملاحظات مهمة
- **السحب والإفلات (Netlify Drop) لا يناسب هذه النسخة**، لأنها تحتوي على دوال خادم وحزم تحتاج تثبيتًا.
- الاختبارات: `npm test` (تعمل بدون إنترنت).
- قبل الإطلاق: أضف بيانات المنتجات الحقيقية، وراجع صفحات الشحن والإرجاع والخصوصية والشروط مع صاحب المتجر أو محامٍ.
- الدفع الإلكتروني غير مفعّل؛ الطلب يُدفع عند الاستلام.
