#!/bin/bash
# ============================================================
# backup-db.sh — Automated PostgreSQL backup to S3/Backblaze B2
# ============================================================
# Usage:
#   ./scripts/backup-db.sh                  # Daily backup
#   ./scripts/backup-db.sh --weekly         # Weekly backup (kept 4 weeks)
#   ./scripts/backup-db.sh --restore FILE   # Restore from backup file
#
# Environment variables:
#   DATABASE_URL          — PostgreSQL connection string
#   BACKUP_BUCKET         — S3 bucket name (e.g., s3://my-backups/)
#   AWS_ACCESS_KEY_ID     — AWS credentials
#   AWS_SECRET_ACCESS_KEY — AWS credentials
#   AWS_DEFAULT_REGION    — AWS region (default: eu-west-3)
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
BACKUP_DIR="${PROJECT_ROOT}/backups"
MODE="${1:-daily}"

# Colorized output
info()  { echo -e "\033[1;34m[INFO]\033[0m  $*"; }
ok()    { echo -e "\033[1;32m[OK]\033[0m    $*"; }
err()   { echo -e "\033[1;31m[ERROR]\033[0m $*"; }

# --- Validation -----------------------------------------------------------
if [ -z "${DATABASE_URL:-}" ]; then
  # Try loading from .env
  if [ -f "$PROJECT_ROOT/.env" ]; then
    export "$(grep -E '^DATABASE_URL=' "$PROJECT_ROOT/.env" | head -1)"
  fi
fi

if [ -z "${DATABASE_URL:-}" ]; then
  err "DATABASE_URL is not set"
  echo "  Set it in your environment or .env file"
  exit 1
fi

if ! command -v pg_dump &> /dev/null; then
  err "pg_dump is not installed. Install PostgreSQL client tools."
  exit 1
fi

if [ -z "${BACKUP_BUCKET:-}" ]; then
  info "BACKUP_BUCKET not set — saving locally only"
  LOCAL_ONLY=true
else
  LOCAL_ONLY=false
  if ! command -v aws &> /dev/null && ! command -v s3cmd &> /dev/null; then
    err "Neither aws CLI nor s3cmd found. Install one for S3 backups."
    exit 1
  fi
fi

# --- Restore mode ---------------------------------------------------------
if [ "$MODE" = "--restore" ]; then
  RESTORE_FILE="${2:-}"
  if [ -z "$RESTORE_FILE" ]; then
    err "Usage: $0 --restore <backup-file>"
    exit 1
  fi
  if [ ! -f "$RESTORE_FILE" ]; then
    err "Backup file not found: $RESTORE_FILE"
    exit 1
  fi
  info "Restoring from $RESTORE_FILE ..."
  psql "$DATABASE_URL" < "$RESTORE_FILE"
  ok "Restore complete"
  exit 0
fi

# --- Create backup --------------------------------------------------------
mkdir -p "$BACKUP_DIR"

FILENAME="backup_${TIMESTAMP}.sql.gz"
FILEPATH="${BACKUP_DIR}/${FILENAME}"
WEEKLY_FILENAME="weekly_${TIMESTAMP}.sql.gz"
WEEKLY_FILEPATH="${BACKUP_DIR}/${WEEKLY_FILENAME}"

info "Starting backup: $FILENAME"

if [ "$MODE" = "--weekly" ]; then
  pg_dump "$DATABASE_URL" | gzip > "$WEEKLY_FILEPATH"
  BACKUP_FILE="$WEEKLY_FILEPATH"
  REMOTE_PATH="${BACKUP_BUCKET}weekly/${WEEKLY_FILENAME}"
  info "Weekly backup created"
else
  pg_dump "$DATABASE_URL" | gzip > "$FILEPATH"
  BACKUP_FILE="$FILEPATH"
  REMOTE_PATH="${BACKUP_BUCKET}daily/${FILENAME}"
  info "Daily backup created"
fi

ok "Local backup saved: $(du -h "$BACKUP_FILE" | cut -f1)"

# --- Upload to S3/Backblaze B2 -------------------------------------------
if [ "$LOCAL_ONLY" = false ]; then
  info "Uploading to $BACKUP_BUCKET ..."
  
  if command -v aws &> /dev/null; then
    aws s3 cp "$BACKUP_FILE" "$REMOTE_PATH" --only-show-errors
  elif command -v s3cmd &> /dev/null; then
    s3cmd put "$BACKUP_FILE" "$REMOTE_PATH"
  fi
  
  ok "Upload complete: $REMOTE_PATH"
fi

# --- Retention cleanup ----------------------------------------------------
if [ "$MODE" != "--weekly" ]; then
  # Remove daily backups older than 7 days
  find "$BACKUP_DIR" -name "backup_*.sql.gz" -type f -mtime +7 -delete
  info "Cleaned daily backups older than 7 days"

  if [ "$LOCAL_ONLY" = false ]; then
    # Remove remote daily backups older than 7 days
    OLD_DATE=$(date -d "7 days ago" +%Y-%m-%d)
    aws s3 ls "${BACKUP_BUCKET}daily/" --recursive 2>/dev/null | \
      while read -r line; do
        FILE_DATE=$(echo "$line" | awk '{print $1}')
        FILE_KEY=$(echo "$line" | awk '{print $4}')
        if [[ "$FILE_DATE" < "$OLD_DATE" ]]; then
          aws s3 rm "${BACKUP_BUCKET}${FILE_KEY}" --only-show-errors 2>/dev/null
        fi
      done
    info "Cleaned remote daily backups older than 7 days"
  fi
fi

# --- Prisma migration pre-hook backup ------------------------------------
if [ "${PRISMA_MIGRATION:-}" = "true" ]; then
  info "Pre-migration backup complete"
fi

ok "Backup finished successfully"
exit 0
