import { PrismaClient, UserRole, ContactStage, TemplateStatus, ConversationStatus, MessageDirection, MessageSenderType, MessageType, IntegrationProvider, IntegrationStatus, OrderStatus, FlowStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import { SANDBOX_INBOUND_IMAGE_DATA_URI } from "../src/lib/integrations/fixtures";

// الزرع (seeding) عملية عابرة لكل المستأجرين بطبيعتها (ينشئ عدة تجار دفعة واحدة)، لذلك يستخدم
// اتصال BYPASSRLS (نفس المستخدم في superAdminDb) بدل DATABASE_URL التشغيلي الخاضع لـ RLS —
// وإلا سترفض قاعدة البيانات كل عمليات الإدخال (اكتُشف فعلياً عند إعادة تشغيل هذا السكربت).
const db = new PrismaClient({ datasources: { db: { url: process.env.SUPER_ADMIN_DATABASE_URL } } });

const DEMO_PASSWORD = "Demo@12345";

async function main() {
  console.log("🌱 بدء إنشاء بيانات تجريبية...");

  const starterChatbotLimits = {
    maxActiveFlows: 2,
    allowedNodeTypes: ["start", "message", "question", "condition", "handoff", "end"],
    templatesTier: "basic", analyticsTier: "basic", multiLanguage: false,
  };
  const growthChatbotLimits = {
    maxActiveFlows: 15,
    allowedNodeTypes: ["start", "message", "question", "condition", "ai_reply", "api_call", "handoff", "end"],
    templatesTier: "full", analyticsTier: "advanced", multiLanguage: false,
    maxAiTokensPerMonth: 50000, // حصة معقولة للموظف الذكي — قابلة للتعديل لاحقاً من admin/plans
  };
  const scaleChatbotLimits = {
    maxActiveFlows: -1,
    allowedNodeTypes: ["start", "message", "question", "condition", "ai_reply", "api_call", "handoff", "end"],
    templatesTier: "full", analyticsTier: "export", multiLanguage: true,
    maxAiTokensPerMonth: -1, // غير محدود لأعلى باقة
  };

  const starterCampaignLimits = { maxCampaignsPerMonth: 4, maxAudiencePerCampaign: 200, abTestingEnabled: false };
  const growthCampaignLimits = { maxCampaignsPerMonth: 20, maxAudiencePerCampaign: 5000, abTestingEnabled: true };
  const scaleCampaignLimits = { maxCampaignsPerMonth: -1, maxAudiencePerCampaign: -1, abTestingEnabled: true };

  const plans = await Promise.all([
    db.plan.upsert({
      where: { key: "starter" },
      update: { chatbotLimitsJson: starterChatbotLimits, campaignLimitsJson: starterCampaignLimits },
      create: {
        key: "starter", name: "الأساسية", priceMonthlySar: 199,
        maxUsers: 3, maxWhatsappNumbers: 1, maxMessagesPerMonth: 2000,
        features: ["حملة واتساب واحدة نشطة", "شات بوت أساسي", "ربط منصة متجر واحدة"],
        chatbotLimitsJson: starterChatbotLimits, campaignLimitsJson: starterCampaignLimits,
      },
    }),
    db.plan.upsert({
      where: { key: "growth" },
      update: { chatbotLimitsJson: growthChatbotLimits, campaignLimitsJson: growthCampaignLimits },
      create: {
        key: "growth", name: "النمو", priceMonthlySar: 499,
        maxUsers: 10, maxWhatsappNumbers: 2, maxMessagesPerMonth: 10000,
        features: ["حملات غير محدودة", "شات بوت بالذكاء الاصطناعي", "استرداد السلة المتروكة", "ربط زد وسلة معاً"],
        chatbotLimitsJson: growthChatbotLimits, campaignLimitsJson: growthCampaignLimits,
      },
    }),
    db.plan.upsert({
      where: { key: "scale" },
      update: { chatbotLimitsJson: scaleChatbotLimits, campaignLimitsJson: scaleCampaignLimits },
      create: {
        key: "scale", name: "التوسع", priceMonthlySar: 1299,
        maxUsers: 50, maxWhatsappNumbers: 5, maxMessagesPerMonth: 50000,
        features: ["كل ميزات النمو", "أرقام واتساب متعددة", "دعم أولوية", "تقارير متقدمة"],
        chatbotLimitsJson: scaleChatbotLimits, campaignLimitsJson: scaleCampaignLimits,
      },
    }),
  ]);

  const superAdmin = await db.user.upsert({
    where: { email: "admin@platform.sa" },
    update: {},
    create: {
      name: "مدير المنصة", email: "admin@platform.sa",
      passwordHash: await bcrypt.hash(DEMO_PASSWORD, 10),
      role: UserRole.SUPER_ADMIN, tenantId: null,
    },
  });

  // فريق المنصة الداخلي بصلاحيات مجزّأة (RBAC حقيقي على الـ API وليس إخفاء واجهة فقط)
  await db.user.upsert({
    where: { email: "support@platform.sa" },
    update: {},
    create: {
      name: "فريق الدعم الفني", email: "support@platform.sa",
      passwordHash: await bcrypt.hash(DEMO_PASSWORD, 10),
      role: UserRole.PLATFORM_SUPPORT, tenantId: null,
    },
  });
  await db.user.upsert({
    where: { email: "billing@platform.sa" },
    update: {},
    create: {
      name: "الفريق المالي", email: "billing@platform.sa",
      passwordHash: await bcrypt.hash(DEMO_PASSWORD, 10),
      role: UserRole.PLATFORM_BILLING, tenantId: null,
    },
  });

  const tenantsData = [
    { slug: "tenant-a", name: "متجر الأناقة للعطور", color: "#6D5EF8" },
    { slug: "tenant-b", name: "بوتيك لمسة", color: "#22C55E" },
  ];

  for (const [idx, t] of tenantsData.entries()) {
    const tenant = await db.tenant.upsert({
      where: { slug: t.slug },
      update: {},
      create: { slug: t.slug, name: t.name, primaryColor: t.color, status: "ACTIVE" },
    });

    const owner = await db.user.upsert({
      where: { email: `owner@${t.slug}.sa` },
      update: {},
      create: {
        name: `صاحب ${t.name}`, email: `owner@${t.slug}.sa`,
        passwordHash: await bcrypt.hash(DEMO_PASSWORD, 10),
        role: UserRole.OWNER, tenantId: tenant.id,
      },
    });

    const agent = await db.user.upsert({
      where: { email: `agent@${t.slug}.sa` },
      update: {},
      create: {
        name: `موظف رد ${idx + 1}`, email: `agent@${t.slug}.sa`,
        passwordHash: await bcrypt.hash(DEMO_PASSWORD, 10),
        role: UserRole.AGENT, tenantId: tenant.id,
      },
    });

    await db.user.upsert({
      where: { email: `admin@${t.slug}.sa` },
      update: {},
      create: {
        name: `مدير ${t.name}`, email: `admin@${t.slug}.sa`,
        passwordHash: await bcrypt.hash(DEMO_PASSWORD, 10),
        role: UserRole.ADMIN, tenantId: tenant.id,
      },
    });

    await db.subscription.upsert({
      where: { tenantId: tenant.id },
      update: {},
      create: {
        tenantId: tenant.id,
        planId: plans[idx === 0 ? 1 : 0].id,
        status: "ACTIVE",
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000),
        messagesUsedThisPeriod: idx === 0 ? 3400 : 210,
      },
    });

    const vipTag = await db.tag.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: "VIP" } },
      update: {},
      create: { tenantId: tenant.id, name: "VIP", color: "#F59E0B" },
    });

    const contacts = [];
    const namesA = ["سارة العتيبي", "محمد القحطاني", "نورة الدوسري", "فهد الشمري", "ريم الحربي"];
    const namesB = ["خالد المطيري", "لمى الغامدي", "عبدالله السبيعي"];
    const names = idx === 0 ? namesA : namesB;
    for (let i = 0; i < names.length; i++) {
      const contact = await db.contact.upsert({
        where: { tenantId_phoneE164: { tenantId: tenant.id, phoneE164: `+9665${idx}${i}000000` } },
        update: {},
        create: {
          tenantId: tenant.id,
          name: names[i]!,
          phoneE164: `+9665${idx}${i}000000`,
          stage: i === 0 ? ContactStage.REPEAT : i % 2 === 0 ? ContactStage.CUSTOMER : ContactStage.LEAD,
        },
      });
      if (i === 0) {
        await db.contactTag.upsert({
          where: { contactId_tagId: { contactId: contact.id, tagId: vipTag.id } },
          update: {}, create: { contactId: contact.id, tagId: vipTag.id },
        });
      }
      // آخر جهة اتصال بكل مستأجر تُعامَل كمن ألغت موافقتها على الرسائل التسويقية — لإظهار أثر
      // فلتر الامتثال الإلزامي فعلياً في معاينة الجمهور بدل أن يكون كل العملاء موافقين دائماً.
      if (i === names.length - 1) {
        await db.contact.update({ where: { id: contact.id }, data: { marketingOptIn: false } });
      }
      contacts.push(contact);
    }

    const templateSubmittedAt = new Date(Date.now() - 20 * 24 * 3600 * 1000);
    const template = await db.messageTemplate.upsert({
      where: { tenantId_name_language: { tenantId: tenant.id, name: "abandoned_cart_recovery", language: "ar" } },
      update: {},
      create: {
        tenantId: tenant.id, name: "abandoned_cart_recovery", category: "MARKETING", language: "ar",
        bodyText: "مرحباً {{1}}، لاحظنا أنك تركت منتجات في سلتك 🛒 أكمل طلبك الآن واحصل على خصم 10%!",
        status: TemplateStatus.APPROVED,
        externalTemplateId: idx === 0 ? "sandbox-tpl-seed-approved-001" : undefined,
        submittedAt: templateSubmittedAt, decidedAt: new Date(templateSubmittedAt.getTime() + 2 * 24 * 3600 * 1000),
      },
    });

    if (idx === 0) {
      await db.messageTemplate.upsert({
        where: { tenantId_name_language: { tenantId: tenant.id, name: "eid_offer_2026", language: "ar" } },
        update: {},
        create: {
          tenantId: tenant.id, name: "eid_offer_2026", category: "MARKETING", language: "ar",
          bodyText: "أهلاً {{1}}! عرض العيد بدأ الآن 🎉 خصم يصل إلى 30% على مجموعتنا الجديدة.",
          status: TemplateStatus.PENDING,
          externalTemplateId: "sandbox-tpl-seed-pending-001",
          submittedAt: new Date(Date.now() - 2 * 3600 * 1000),
        },
      });

      // قالب مرفوض فعلياً — لاختبار عرض سبب الرفض الحقيقي وزر "تعديل وإعادة إرسال"
      await db.messageTemplate.upsert({
        where: { tenantId_name_language: { tenantId: tenant.id, name: "flash_sale_promo", language: "ar" } },
        update: {},
        create: {
          tenantId: tenant.id, name: "flash_sale_promo", category: "MARKETING", language: "ar",
          bodyText: "عرض البرق! خصم 50% لمدة ساعتين فقط، اطلب الآن قبل نفاد الكمية!",
          status: TemplateStatus.REJECTED,
          rejectionReason: "المحتوى يخالف سياسة واتساب التجارية (WhatsApp Business Policy) لهذه الفئة",
          externalTemplateId: "sandbox-tpl-seed-rejected-001",
          submittedAt: new Date(Date.now() - 5 * 24 * 3600 * 1000),
          decidedAt: new Date(Date.now() - 4 * 24 * 3600 * 1000),
        },
      });

      // قالب مُعلَّق بعد اعتماده سابقاً بسبب جودة أداء منخفضة — يوضّح حالة PAUSED المستحدثة هذه الجولة
      await db.messageTemplate.upsert({
        where: { tenantId_name_language: { tenantId: tenant.id, name: "order_confirmation_v1", language: "ar" } },
        update: {},
        create: {
          tenantId: tenant.id, name: "order_confirmation_v1", category: "UTILITY", language: "ar",
          bodyText: "تم تأكيد طلبك رقم {{1}} بنجاح، شكراً لثقتك بنا!",
          status: TemplateStatus.PAUSED,
          rejectionReason: "انخفاض جودة تفاعل المستلمين مع هذا القالب خلال آخر 7 أيام",
          externalTemplateId: "sandbox-tpl-seed-paused-001",
          submittedAt: new Date(Date.now() - 60 * 24 * 3600 * 1000),
          decidedAt: new Date(Date.now() - 3 * 24 * 3600 * 1000),
        },
      });
    }

    if (idx === 0) {
      const summerSegment = await db.segment.create({
        data: { tenantId: tenant.id, name: "كل العملاء (حملة عرض الصيف)", filterJson: { stage: "ALL" } },
      });

      const summerCampaign = await db.campaign.create({
        data: {
          tenantId: tenant.id, name: "حملة عرض الصيف", type: "ONE_TIME", audienceType: "ALL",
          segmentId: summerSegment.id, templateId: template.id, status: "COMPLETED",
          sentCount: 4, deliveredCount: 1, readCount: 1, repliedCount: 1, failedCount: 1,
        },
      });

      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 3600 * 1000);
      await db.campaignRecipient.createMany({
        data: [
          { campaignId: summerCampaign.id, contactId: contacts[0]!.id, status: "REPLIED", sentAt: threeDaysAgo, deliveredAt: threeDaysAgo, readAt: threeDaysAgo },
          { campaignId: summerCampaign.id, contactId: contacts[1]!.id, status: "READ", sentAt: threeDaysAgo, deliveredAt: threeDaysAgo, readAt: threeDaysAgo },
          { campaignId: summerCampaign.id, contactId: contacts[2]!.id, status: "DELIVERED", sentAt: threeDaysAgo, deliveredAt: threeDaysAgo },
          { campaignId: summerCampaign.id, contactId: contacts[3]!.id, status: "FAILED", sentAt: threeDaysAgo, errorMessage: "الرقم محظور أو أوقف استقبال الرسائل التسويقية" },
        ],
      });

      // طلب فعلي بعد الحملة بيوم واحد — يُربط تلقائياً كـ"تحويل ناتج عن الحملة" أول مرة تُفتح صفحة
      // تفاصيلها (linkCampaignConversions حية وليست بيانات مُلفَّقة مسبقاً في الزرع).
      await db.order.upsert({
        where: { tenantId_externalSource_externalId: { tenantId: tenant.id, externalSource: IntegrationProvider.ZID, externalId: "zid-order-2001" } },
        update: {},
        create: {
          tenantId: tenant.id, contactId: contacts[0]!.id,
          externalSource: IntegrationProvider.ZID, externalId: "zid-order-2001",
          status: OrderStatus.PAID, totalSar: 265,
          createdAt: new Date(Date.now() - 2 * 24 * 3600 * 1000),
        },
      });

      // حملة آلية فعلية (استرداد سلة متروكة) — نشطة ومستمرة، مع سجل تشغيل تاريخي واحد (الطلب
      // الأصلي أدناه) بالإضافة لسلة متروكة جديدة لم تُعالَج بعد (لاختبار زر "فحص الآن" حياً).
      const abandonedCartCampaign = await db.campaign.create({
        data: {
          tenantId: tenant.id, name: "استرداد السلة المتروكة (آلي)", type: "TRIGGERED", audienceType: "SEGMENT",
          templateId: template.id, status: "ACTIVE", triggerEvent: "ABANDONED_CART", triggerConfigJson: {},
        },
      });

      const oldAbandonedOrder = await db.order.upsert({
        where: { tenantId_externalSource_externalId: { tenantId: tenant.id, externalSource: IntegrationProvider.ZID, externalId: "zid-order-1001" } },
        update: {},
        create: {
          tenantId: tenant.id, contactId: contacts[1]!.id,
          externalSource: IntegrationProvider.ZID, externalId: "zid-order-1001",
          status: OrderStatus.ABANDONED_CART, totalSar: 340,
          recoveryMessageSentAt: new Date(Date.now() - 5 * 24 * 3600 * 1000),
        },
      });
      await db.campaignRecipient.upsert({
        where: { campaignId_contactId: { campaignId: abandonedCartCampaign.id, contactId: contacts[1]!.id } },
        update: {},
        create: {
          campaignId: abandonedCartCampaign.id, contactId: oldAbandonedOrder.contactId,
          status: "DELIVERED", sentAt: new Date(Date.now() - 5 * 24 * 3600 * 1000), deliveredAt: new Date(Date.now() - 5 * 24 * 3600 * 1000),
        },
      });

      await db.order.upsert({
        where: { tenantId_externalSource_externalId: { tenantId: tenant.id, externalSource: IntegrationProvider.SALLA, externalId: "salla-order-3001" } },
        update: {},
        create: {
          tenantId: tenant.id, contactId: contacts[2]!.id,
          externalSource: IntegrationProvider.SALLA, externalId: "salla-order-3001",
          status: OrderStatus.ABANDONED_CART, totalSar: 180,
        },
      });
    }

    // محادثة 1: "يحتاج رد" مع تجاوز فعلي لحد SLA (آخر رسالة قبل ساعتين، أكثر من حد 15 دقيقة) —
    // لإظهار المؤشر الأحمر ⏰ في قائمة المحادثات فوراً دون أي تدخل يدوي أثناء الاختبار.
    const slaConvo = await db.conversation.create({
      data: {
        tenantId: tenant.id, contactId: contacts[0]!.id,
        status: ConversationStatus.NEEDS_REPLY, controlMode: "HUMAN",
        assignedAgentId: agent.id,
        lastMessageAt: new Date(Date.now() - 2 * 3600 * 1000),
        sessionWindowExpiresAt: new Date(Date.now() + 22 * 3600 * 1000),
      },
    });
    await db.message.create({
      data: {
        tenantId: tenant.id, conversationId: slaConvo.id, direction: MessageDirection.INBOUND,
        senderType: MessageSenderType.CONTACT, type: MessageType.TEXT,
        body: "مرحباً، أريد الاستفسار عن حالة طلبي", createdAt: new Date(Date.now() - 2 * 3600 * 1000),
      },
    });

    // محادثة 2: بانتظار العميل (OPEN) بعد رد فعلي، مع تشكيلة وسائط كاملة (صورة/مستند/موقع) —
    // لاختبار عرض الفقاعات بكل الأنواع المطلوبة في نفس المحادثة.
    if (idx === 0 && contacts[1]) {
      const mediaConvo = await db.conversation.create({
        data: {
          tenantId: tenant.id, contactId: contacts[1].id,
          status: ConversationStatus.OPEN, controlMode: "HUMAN", assignedAgentId: agent.id,
          lastMessageAt: new Date(Date.now() - 30 * 60 * 1000),
          sessionWindowExpiresAt: new Date(Date.now() + 23 * 3600 * 1000),
        },
      });
      await db.message.createMany({
        data: [
          {
            tenantId: tenant.id, conversationId: mediaConvo.id, direction: MessageDirection.INBOUND,
            senderType: MessageSenderType.CONTACT, type: MessageType.IMAGE,
            body: "هذه صورة المنتج اللي وصلني، فيه خلل بسيط",
            mediaUrl: SANDBOX_INBOUND_IMAGE_DATA_URI, mediaMimeType: "image/svg+xml",
            createdAt: new Date(Date.now() - 40 * 60 * 1000),
          },
          {
            tenantId: tenant.id, conversationId: mediaConvo.id, direction: MessageDirection.OUTBOUND,
            senderType: MessageSenderType.AGENT, type: MessageType.TEXT,
            body: "نأسف على ذلك! ممكن ترسل لنا رقم الفاتورة كمستند للمتابعة؟",
            status: "READ", statusUpdatedAt: new Date(Date.now() - 38 * 60 * 1000),
            createdAt: new Date(Date.now() - 39 * 60 * 1000),
          },
          {
            tenantId: tenant.id, conversationId: mediaConvo.id, direction: MessageDirection.INBOUND,
            senderType: MessageSenderType.CONTACT, type: MessageType.DOCUMENT,
            body: "فاتورة-إرجاع.pdf", mediaUrl: "https://example.com/sandbox-files/invoice-return.pdf",
            mediaMimeType: "application/pdf", createdAt: new Date(Date.now() - 35 * 60 * 1000),
          },
          {
            tenantId: tenant.id, conversationId: mediaConvo.id, direction: MessageDirection.INBOUND,
            senderType: MessageSenderType.CONTACT, type: MessageType.LOCATION,
            body: "الرياض، المملكة العربية السعودية", latitude: 24.7136, longitude: 46.6753,
            createdAt: new Date(Date.now() - 33 * 60 * 1000),
          },
          {
            tenantId: tenant.id, conversationId: mediaConvo.id, direction: MessageDirection.OUTBOUND,
            senderType: MessageSenderType.AGENT, type: MessageType.TEXT,
            body: "تمام، وصلنا الموقع والفاتورة. سيتواصل معك مندوب الاستلام خلال ساعة 🙏",
            status: "DELIVERED", statusUpdatedAt: new Date(Date.now() - 30 * 60 * 1000),
            createdAt: new Date(Date.now() - 30 * 60 * 1000),
          },
        ],
      });
      await db.internalNote.create({
        data: {
          tenantId: tenant.id, conversationId: mediaConvo.id, authorId: agent.id,
          body: "العميل ذكر أن المنتج فيه خلل بسيط — تابعنا مع المستودع، الاستبدال في الطريق.",
        },
      });
    }

    // محادثة 3: تم الحل يدوياً فعلياً (resolvedAt محدَّد) — تمييز واضح عن "بانتظار العميل"
    if (contacts[2]) {
      const resolvedConvo = await db.conversation.create({
        data: {
          tenantId: tenant.id, contactId: contacts[2].id,
          status: ConversationStatus.RESOLVED, controlMode: "HUMAN", assignedAgentId: agent.id,
          lastMessageAt: new Date(Date.now() - 5 * 3600 * 1000),
          resolvedAt: new Date(Date.now() - 4 * 3600 * 1000),
          sessionWindowExpiresAt: new Date(Date.now() + 19 * 3600 * 1000),
        },
      });
      await db.message.createMany({
        data: [
          { tenantId: tenant.id, conversationId: resolvedConvo.id, direction: MessageDirection.INBOUND, senderType: MessageSenderType.CONTACT, type: MessageType.TEXT, body: "شكراً جزيلاً على المتابعة السريعة 🙏", createdAt: new Date(Date.now() - 5 * 3600 * 1000) },
          { tenantId: tenant.id, conversationId: resolvedConvo.id, direction: MessageDirection.OUTBOUND, senderType: MessageSenderType.AGENT, type: MessageType.TEXT, body: "أهلاً بك! سعيد بخدمتك دائماً 🌟", status: "READ", statusUpdatedAt: new Date(Date.now() - 4 * 3600 * 1000), createdAt: new Date(Date.now() - 4 * 3600 * 1000) },
        ],
      });
    }

    if (idx === 0) {
      await db.quickReply.createMany({
        data: [
          { tenantId: tenant.id, shortcut: "شكر", body: "شكراً لتواصلك معنا! يسعدنا خدمتك 🙏", createdByUserId: agent.id },
          { tenantId: tenant.id, shortcut: "شحن", body: "طلبك قيد الشحن حالياً وسيصلك خلال 2-3 أيام عمل 🚚", createdByUserId: agent.id },
        ],
      });
    }

    await db.chatbotFlow.create({
      data: {
        tenantId: tenant.id, name: "الترحيب وحالة الطلب", status: FlowStatus.PUBLISHED,
        templateId: "order_status", testRunCount: 1, lastTestedAt: new Date(),
        nodesJson: {
          nodes: [
            { id: "start", type: "start", label: "عند أول رسالة من العميل", position: { x: 300, y: 40 } },
            { id: "n2", type: "condition", label: "هل يسأل عن طلب؟", position: { x: 300, y: 180 } },
            { id: "n3", type: "ai_reply", label: "رد ذكي مبني على حالة الطلب", position: { x: 100, y: 320 } },
            { id: "n4", type: "handoff", label: "تحويل لموظف إن لم يُحل", position: { x: 500, y: 320 } },
          ],
          edges: [
            { id: "e1", source: "start", target: "n2" },
            { id: "e2", source: "n2", target: "n3", sourceHandle: "true" },
            { id: "e3", source: "n2", target: "n4", sourceHandle: "false" },
          ],
        },
      },
    });

    for (const provider of [IntegrationProvider.META_WHATSAPP, IntegrationProvider.ZID, IntegrationProvider.SALLA]) {
      const isMeta = provider === IntegrationProvider.META_WHATSAPP;
      await db.integration.upsert({
        where: { tenantId_provider: { tenantId: tenant.id, provider } },
        update: {},
        create: {
          tenantId: tenant.id, provider,
          status: idx === 0 ? IntegrationStatus.CONNECTED : IntegrationStatus.DISCONNECTED,
          isSandbox: true,
          externalAccountId: idx === 0 ? `sandbox-${provider.toLowerCase()}-001` : null,
          webhookSubscribed: idx === 0 && isMeta,
          lastSyncedAt: idx === 0 ? new Date() : null,
          metadataJson:
            idx === 0 && isMeta
              ? {
                  phoneNumberId: "sandbox-phone-778812345", wabaId: "sandbox-waba-demo001",
                  displayPhoneNumber: "+966 55 000 1234", verifiedName: "متجر الأناقة للعطور",
                  qualityRating: "GREEN", messagingTier: "TIER_1K (حتى 1000 محادثة/24 ساعة)",
                }
              : undefined,
        },
      });
    }

    console.log(`✅ تم إنشاء المستأجر: ${tenant.name} (owner: owner@${t.slug}.sa / agent: agent@${t.slug}.sa)`);

    if (idx === 0) {
      const existingNote = await db.merchantNote.findFirst({ where: { tenantId: tenant.id } });
      if (!existingNote) {
        await db.merchantNote.create({
          data: {
            tenantId: tenant.id, authorId: superAdmin.id,
            body: "تاجر نشط جداً، مرشّح جيد للترقية لباقة التوسع — تواصل معه عند اقتراب حد الرسائل.",
          },
        });
      }
    }
  }

  // مستأجر تجريبي ثالث بحالة "بانتظار المراجعة" لاختبار مركز الموافقات فعلياً
  const pendingTenant = await db.tenant.upsert({
    where: { slug: "tenant-pending" },
    update: { status: "PENDING_REVIEW" },
    create: { slug: "tenant-pending", name: "متجر الرياض للهدايا", primaryColor: "#F59E0B", status: "PENDING_REVIEW" },
  });
  await db.user.upsert({
    where: { email: "owner@tenant-pending.sa" },
    update: {},
    create: {
      name: "صاحب متجر الرياض للهدايا", email: "owner@tenant-pending.sa",
      passwordHash: await bcrypt.hash(DEMO_PASSWORD, 10),
      role: UserRole.OWNER, tenantId: pendingTenant.id,
    },
  });
  await db.subscription.upsert({
    where: { tenantId: pendingTenant.id },
    update: {},
    create: {
      tenantId: pendingTenant.id, planId: plans[0]!.id, status: "TRIALING",
      currentPeriodEnd: new Date(Date.now() + 14 * 24 * 3600 * 1000),
    },
  });
  for (const provider of [IntegrationProvider.META_WHATSAPP, IntegrationProvider.ZID, IntegrationProvider.SALLA]) {
    await db.integration.upsert({
      where: { tenantId_provider: { tenantId: pendingTenant.id, provider } },
      update: {}, create: { tenantId: pendingTenant.id, provider, status: IntegrationStatus.DISCONNECTED, isSandbox: true },
    });
  }
  const existingPendingRequest = await db.approvalRequest.findFirst({ where: { tenantId: pendingTenant.id, type: "NEW_TENANT" } });
  if (!existingPendingRequest) {
    await db.approvalRequest.create({
      data: {
        tenantId: pendingTenant.id, type: "NEW_TENANT", status: "PENDING",
        payloadJson: { businessActivity: "متجر هدايا ومناسبات", requestedPlanKey: "starter" },
      },
    });
  }
  console.log(`✅ تم إنشاء مستأجر تجريبي بانتظار المراجعة: ${pendingTenant.name} (owner@tenant-pending.sa)`);

  // إعلان منصة تجريبي (in-app) لكل التجار
  const existingAnnouncement = await db.platformAnnouncement.findFirst({ where: { title: "صيانة مجدولة الجمعة القادمة" } });
  if (!existingAnnouncement) {
    await db.platformAnnouncement.create({
      data: {
        title: "صيانة مجدولة الجمعة القادمة",
        body: "سنجري صيانة مجدولة على المنصة يوم الجمعة من 2-4 صباحاً بتوقيت السعودية. قد تواجه توقفاً قصيراً.",
        audienceType: "ALL",
        createdByUserId: superAdmin.id,
      },
    });
  }

  console.log(`\n🔑 كلمة مرور جميع الحسابات التجريبية: ${DEMO_PASSWORD}`);
  console.log(`🔑 Super Admin: admin@platform.sa / ${DEMO_PASSWORD}`);
  console.log(`🔑 فريق الدعم: support@platform.sa / ${DEMO_PASSWORD}`);
  console.log(`🔑 الفريق المالي: billing@platform.sa / ${DEMO_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
