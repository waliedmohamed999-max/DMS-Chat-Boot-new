CREATE TABLE "MarketingPlan" (
  "id" TEXT NOT NULL, "key" TEXT NOT NULL, "name" TEXT NOT NULL,
  "monthlySar" INTEGER NOT NULL, "annualSar" INTEGER NOT NULL,
  "popular" BOOLEAN NOT NULL DEFAULT false, "startingFrom" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true, "summary" TEXT NOT NULL,
  "audience" TEXT NOT NULL, "delivery" TEXT NOT NULL, "features" JSONB NOT NULL, "exclusions" JSONB NOT NULL,
  CONSTRAINT "MarketingPlan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MarketingPlan_key_key" ON "MarketingPlan"("key");
INSERT INTO "MarketingPlan" ("id","key","name","monthlySar","annualSar","popular","startingFrom","summary","audience","delivery","features","exclusions") VALUES ('marketing-wa-basic','wa-basic','الانطلاق',599,5990,false,false,'رقم رسمي منظم وفريق يرد من مكان واحد','للأنشطة التي تبدأ مع واتساب الأعمال الرسمي','3 أيام عمل بعد اعتماد ميتا','["ربط رقمك الرسمي وتوثيق النشاط لدى ميتا","صندوق محادثات لمستخدم واحد","قائمة ترحيب للخدمات والفروع وأوقات العمل","رد خارج الدوام و20 رداً سريعاً","تصنيف المحادثات وملاحظات داخلية","تقرير شهري للمحادثات وسرعة الرد"]','["رسوم رسائل ميتا حسب الاستخدام","الشات بوت والحملات ضمن الباقات الأعلى"]');
INSERT INTO "MarketingPlan" ("id","key","name","monthlySar","annualSar","popular","startingFrom","summary","audience","delivery","features","exclusions") VALUES ('marketing-wa-pro','wa-pro','الاحترافية',1299,12990,true,false,'بوت يرد ويحجز ويؤهل العملاء ويوزعهم على فريقك','للعيادات والمتاجر والعقار والأنشطة الخدمية','7 أيام عمل بعد اعتماد ميتا','["مستخدمان مع توزيع المحادثات","شات بوت بمسارات مخصصة لنشاطك","تأهيل العميل وتحويله للفريق بملخص","10 قوالب رسائل للتأكيد والتذكير والمتابعة","إعداد الحملات للعملاء الموافقين على التواصل","ربط سلة أو زد أو جداول جوجل","تقارير شهرية لأداء الفريق والحملات"]','["رسوم رسائل ميتا حسب الاستخدام","الذكاء الاصطناعي وتكامل CRM ضمن الحلول المتقدمة"]');
INSERT INTO "MarketingPlan" ("id","key","name","monthlySar","annualSar","popular","startingFrom","summary","audience","delivery","features","exclusions") VALUES ('marketing-wa-advanced','wa-advanced','أتمتة الأعمال',2999,29990,false,true,'واتساب مربوط بأنظمتك ومساعد ذكي وأتمتة كاملة','للشركات متعددة الفروع والمتاجر عالية الطلبات','عادةً 3 إلى 4 أسابيع بعد تحديد النطاق','["مزايا الاحترافية مع 3 مستخدمين","مساعد ذكي بالعربية والإنجليزية من ملفاتك","تكامل مع CRM أو ERP","استرداد السلات وإشعارات الطلب والشحن","توزيع المحادثات تلقائياً حسب الفرع","مدير حساب ومراجعة شهرية للأداء"]','["رسوم ميتا والذكاء الاصطناعي حسب الاستخدام","المستخدمون والتكاملات الإضافية حسب الطلب"]');
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN GRANT SELECT ON "MarketingPlan" TO app_runtime; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_superadmin') THEN GRANT SELECT, INSERT, UPDATE, DELETE ON "MarketingPlan" TO app_superadmin; END IF;
END $$;
