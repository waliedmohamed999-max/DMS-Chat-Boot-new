-- الخطوة 1: إضافة القيم الجديدة لأنواع Enum الموجودة فقط، بدون استخدامها كقيمة افتراضية بعد.
-- Postgres يمنع استخدام قيمة enum جديدة في نفس الـ transaction التي أُضيفت فيها، لذلك تُفصل
-- هذه الإضافة في migration خاص بها يُطبَّق ويُلتزَم (commit) قبل أي migration يستخدمها.
ALTER TYPE "TenantStatus" ADD VALUE 'PENDING_REVIEW';
ALTER TYPE "TenantStatus" ADD VALUE 'REJECTED';
ALTER TYPE "UserRole" ADD VALUE 'PLATFORM_SUPPORT';
ALTER TYPE "UserRole" ADD VALUE 'PLATFORM_BILLING';
