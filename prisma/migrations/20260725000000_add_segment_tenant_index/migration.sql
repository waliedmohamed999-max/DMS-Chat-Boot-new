-- Segment.tenantId كان بلا فهرس رغم كونه حقلاً مستأجَراً (tenant-scoped) — يُضاف هنا للتطابق مع
-- بقية الجداول المستأجرة كلها، ولأن الاستعلامات الفعلية (اختيار شرائح الجمهور عند إنشاء حملة) تُصفّي
-- بـtenantId مباشرة.
CREATE INDEX "Segment_tenantId_idx" ON "Segment"("tenantId");
