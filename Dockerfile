# =============================================================================
# صورة إنتاج واحدة تُستخدم لخدمتين منفصلتين (app + worker) في docker-compose.prod.yml، كل واحدة
# بأمر تشغيل مختلف. لم نستخدم output: "standalone" في next.config.js عمداً: worker.ts (BullMQ) هو
# سكربت Node/tsx منفصل تماماً عن شجرة توجيه Next.js، فتتبّع standalone التلقائي لا يشمل اعتمادياته
# ولا ملفات الخطوط اللي htmlToPdf.ts/invoiceTemplate.ts بتقرأها بـ fs.readFileSync وقت التشغيل
# (src/lib/billing/fonts/*.ttf) — بناء منفصل للـworker كان يحتاج تعقيداً غير مبرَّر لحجم هذا النشر.
# صورة كاملة (node_modules + .next الكامل) أبسط وأضمن صحةً؛ الحجم الأكبر مقبول تماماً لهذا الحجم.
# =============================================================================
FROM node:20-slim

# Puppeteer (توليد فواتير PDF عبر Chromium حقيقي — lib/billing/htmlToPdf.ts) يحتاج Chromium نظامي
# ومكتباته المشتركة. نستخدم حزمة Debian الرسمية (chromium عبر apt) بدل تحميل Puppeteer الداخلي —
# تفادياً لتحميل Chromium مرتين ولضمان توافق المكتبات المشتركة تلقائياً.
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    openssl \
    ca-certificates \
    dumb-init \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# طبقة تبعيات منفصلة عن طبقة الكود — إعادة بناء أسرع لو الكود تغيّر بلا تغيّر package.json
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# "prisma generate" جزء من سكربت build نفسه (package.json)، و"next build" يحتاج DATABASE_URL صالح
# الصيغة فقط وقت البناء (raw.ts فيه قيمة احتياطية آمنة — راجع lib/db.ts) بلا اتصال فعلي بقاعدة بيانات.
RUN npm run build

EXPOSE 3000

# dumb-init: معالجة إشارات إيقاف صحيحة (SIGTERM) لكل من عملية الـweb وعملية الـworker الطويلة —
# بدون هذا، "docker compose down"/"restart" ممكن يقطع اتصال قاعدة البيانات فجأة بلا إغلاق نظيف.
ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "run", "start"]
