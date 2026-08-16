-- إضافة قيمة enum جديدة فقط (بدون استخدامها في نفس المعاملة) — راجع الدرس الموثّق في DECISIONS.md
-- حول قيود Postgres على استخدام قيمة enum جديدة في نفس transaction إضافتها.
ALTER TYPE "ApprovalRequestType" ADD VALUE 'MESSAGE_TEMPLATE';
