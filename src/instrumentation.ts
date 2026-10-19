/**
 * يُستدعى مرة واحدة عند بدء خادم Next.js. عند ضبط RUN_WORKER_IN_PROCESS=1 يُشغَّل عامل الخلفية
 * (lib/queue/worker.ts: إرسال الحملات، الحملات الآلية، جلسات واتساب QR، انتهاء الاشتراكات…) داخل نفس
 * عملية الخادم — للاستضافات التي لا تسمح إلا بعملية واحدة (مثل Hostinger Node.js). على خادم يشغّل
 * `npm run worker` كعملية منفصلة اتركه غير مضبوط. تشغيل أكثر من نسخة آمن: BullMQ يسلّم كل مهمة لعامل
 * واحد، والمهام الدورية لها jobId ثابت فلا تتكرر.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.RUN_WORKER_IN_PROCESS !== "1") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const g = globalThis as typeof globalThis & { __dmsWorkerStarted?: boolean };
  if (g.__dmsWorkerStarted) return;
  g.__dmsWorkerStarted = true;

  try {
    await import("./lib/queue/worker");
    console.log("✅ عامل الخلفية يعمل داخل عملية الخادم (RUN_WORKER_IN_PROCESS=1)");
  } catch (err) {
    g.__dmsWorkerStarted = false;
    console.error("❌ تعذّر تشغيل عامل الخلفية داخل الخادم:", err);
  }
}
