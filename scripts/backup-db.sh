#!/usr/bin/env bash
# نسخ احتياطي منطقي (pg_dump) لقاعدة Postgres المُشغَّلة عبر docker-compose (wa_crm_postgres).
# يُشغَّل يدوياً أو عبر مجدوِل حقيقي (cron/Task Scheduler) — الجدولة الفعلية والنسخ لموقع خارجي
# (S3 أو مشابه) قرار بنية تحتية خارج نطاق الكود، موثَّق في LAUNCH_READINESS_REPORT.md.
set -euo pipefail

CONTAINER="${POSTGRES_CONTAINER:-wa_crm_postgres}"
DB_USER="${POSTGRES_USER:-wa_crm}"
DB_NAME="${POSTGRES_DB:-wa_crm}"
BACKUP_DIR="${BACKUP_DIR:-$(dirname "$0")/../backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUT_FILE="$BACKUP_DIR/wa_crm_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

docker exec "$CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$OUT_FILE"

echo "✅ نسخة احتياطية: $OUT_FILE ($(du -h "$OUT_FILE" | cut -f1))"

# حذف النسخ الأقدم من فترة الاحتفاظ
find "$BACKUP_DIR" -name "wa_crm_*.sql.gz" -mtime "+${RETENTION_DAYS}" -delete
