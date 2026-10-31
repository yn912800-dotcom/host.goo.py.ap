# نشر •-تــيــ۾ إڪـXـس-• على Railway

## Control Plane

1. اجعل Root Directory هو جذر المستودع (حيث يوجد `package.json` و`Dockerfile` و`src/app/page.tsx`) واختر Dockerfile builder والمسار `Dockerfile`. يحتوي الملف على فحص صريح لـ `src/app/page.tsx` لمنع خطأ اكتشاف مجلد Next.js عند إرسال build context خاطئ.
2. أضف PostgreSQL وأدخل `DATABASE_URL` من خدمة قاعدة البيانات.
3. عيّن `ADMIN_EMAIL` و`ADMIN_PASSWORD` قويين قبل أول تشغيل.
4. اترك Railway مسؤولًا عن Next.js/Control Plane فقط، مع `PORT` الذي توفره Railway.
5. يوجد `railway.json` يضبط Dockerfile و`GET /api/health` كـ Health Check. الاختبار يفشل عند تعطل قاعدة البيانات أو bootstrap/migrations.
6. استخدم Volume أو Object Storage للملفات؛ نظام ملفات Railway المؤقت ليس مخزنًا دائمًا.

يطبق التطبيق migrations الموجودة في مجلد `drizzle/` عند bootstrap بعد اتصال قاعدة البيانات. أمر CLI للتشغيل اليدوي هو `npm run db:migrate` ويتطلب `DATABASE_URL`؛ لا تستخدم `drizzle-kit push` على قاعدة إنتاج ولا تشغّل migrations من checkout مختلف عن المقصود.

## Runtime Worker

تشغيل Python/Node.js/PHP لكود المستخدمين لا يجب أن يحدث داخل عملية Control Plane. في الإنتاج، عيّن:

```env
RUNTIME_WORKER_URL=https://worker.example.internal
WORKER_SHARED_SECRET=<secret-managed-outside-git>
```

ويجب أن يكون الـ Worker خدمة منفصلة تدعم حاويات غير root مع CPU/RAM/PID/network limits، ومساحة عمل منفصلة لكل مشروع. النسخة الحالية من Control Plane ترفض نشر runtimes الديناميكية في Production؛ لا يكفي ضبط `RUNTIME_WORKER_URL` لأن واجهة Worker المرفقة تدير دورة حياة حاويات موجودة فقط ولا تنقل الملفات أو تبني الصور بعد. يجب ربط provider كامل للنشر عن بُعد قبل تفعيل Python/Node/PHP. المواقع الثابتة والصور يمكن تقديمها عبر Gateway.

## Runtime Worker المرفق

يوجد Worker مستقل في `worker/server.mjs` وصورته في `Dockerfile.worker`. كل طلب يتطلب:

- `x-worker-timestamp`
- `x-worker-request-id`
- `x-worker-signature` بتوقيع HMAC-SHA256

يتم رفض الطلبات القديمة أو المعاد تشغيلها، مع حد لحجم الطلبات ومعدلها. لا يستخدم Worker `shell`، ولا يقبل أوامر Docker عشوائية؛ العمليات محصورة في `start`, `stop`, `restart`, `kill`, و`status`. يجب تشغيله على Dedicated Runtime Host مع Docker Engine مضبوط عبر Private Network، وليس داخل Railway إذا كانت البيئة تمنع العزل المطلوب.

## Image Hosting

يستخدم نوع runtime مستقل باسم `image`، مع:

- رفع متعدد حتى 50 صورة في الطلب.
- PNG/JPEG/WEBP/GIF وSVG بعد Sanitization.
- تحقق من magic bytes للصور النقطية.
- حد 10MB للصورة وحصة server-side.
- قائمة وبحث عبر `/api/servers/:id/images`.
- Direct URL عبر `/api/images/:id` مع `nosniff` وContent-Disposition آمن.

## متغيرات مطلوبة

- `DATABASE_URL`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `NODE_ENV=production`
- `RUNTIME_WORKER_URL` للنشر الديناميكي
- `DATA_DIR` إلى Volume أو طبقة تخزين دائمة عند استخدام التخزين المحلي

لا تضع كلمات المرور أو مفاتيح Telegram أو رموز Worker داخل Git.
