# Disaster Recovery Plan — YouTube TrendHunter

## 1. Service URLs

| Environment | URL |
|-------------|-----|
| Production  | https://youtube-trendhunter.vercel.app |
| Staging     | https://staging-youtube-trendhunter.vercel.app |
| API Base    | https://youtube-trendhunter.vercel.app/api |

## 2. Database Access

| Property | Value |
|----------|-------|
| Provider | Neon (PostgreSQL 16) |
| Production URL | postgresql://... (stored in Vercel env vars) |
| Staging URL | postgresql://... (stored in Vercel env vars) |
| Backup bucket | s3://youtube-trendhunter-backups/ |

**Credentials:** Stored in 1Password vault "YouTube TrendHunter — Infrastructure"

## 3. Recovery Procedure

### 3.1 Full Database Restore

`ash
# 1. Stop the application (Vercel: disable auto-deploy)
# 2. Download the latest backup
aws s3 cp s3://youtube-trendhunter-backups/daily/latest.sql.gz ./restore.sql.gz
# 3. Decompress
gunzip restore.sql.gz
# 4. Restore to production database
psql DATABASE_URL < restore.sql
# 5. Verify schema integrity
npx prisma db push --accept-data-loss
# 6. Restart the application
# 7. Verify metrics
curl https://youtube-trendhunter.vercel.app/api/health
`

### 3.2 Point-in-Time Recovery

If the database supports PITR (Neon does):

`ash
# Restore to 1 hour before incident
neon branches restore --parent main --name restore-point --created-at "2026-06-09T23:00:00Z"
# Update DATABASE_URL to point to the restored branch
`

### 3.3 Application Rollback

`ash
# Roll back Vercel deployment
vercel rollback --prod
# Or redeploy a specific git tag
git checkout tags/v1.2.3
pnpm install && pnpm build:web && vercel deploy --prod
`

## 4. Monitoring & Alerts

| Metric | Threshold | Action |
|--------|-----------|--------|
| Backup age | > 48h since last backup | PagerDuty alert to on-call |
| Database size | > 90% of plan limit | Upgrade plan or archive data |
| API error rate | > 1% in 5 min window | Check logs, rollback if needed |
| SSL certificate expiry | < 14 days | Renew via Vercel |

## 5. Emergency Contacts

| Role | Name | Contact |
|------|------|---------|
| Lead Developer | TBD | tbd@example.com |
| DevOps | TBD | tbd@example.com |
| Database Admin | Neon Support | support@neon.tech |
| Vercel Support | — | https://vercel.com/support |

## 6. RTO & RPO

- **RTO (Recovery Time Objective):** 30 minutes
- **RPO (Recovery Point Objective):** 24 hours (daily backups) / 5 minutes (PITR)

## 7. Testing Schedule

- **Monthly:** Restore backup to staging environment and verify data integrity
- **Quarterly:** Full DRP drill (simulate total database loss)
- **Annually:** Review and update this document

## 8. Secrets Rotation

| Secret | Rotation Frequency | Location |
|--------|-------------------|----------|
| DATABASE_URL | Every 90 days | Vercel env vars + 1Password |
| AUTH_SECRET | Every 180 days | Vercel env vars + 1Password |
| STRIPE keys | On suspicion of leak | Stripe Dashboard + Vercel |
| AWS credentials | Every 90 days | AWS IAM + 1Password |
