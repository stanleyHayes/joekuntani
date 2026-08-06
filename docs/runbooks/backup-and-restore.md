# MongoDB Atlas backup and restore

## Backup policy

- Enable Atlas continuous cloud backup (or daily snapshots) for staging and production clusters.
- Retain production backups for at least 14 days; retain staging for at least 7 days.
- Encryption at rest and in transit remain enabled; restrict restore permissions to operations administrators.

## Monthly restore test

1. Create a temporary restore target database/cluster (never overwrite production).
2. Restore the latest production snapshot into the temporary target.
3. Point a disposable API process at the restored URI with `APP_ENV=staging` and placeholder web origin.
4. Run controlled change ApplyAll verify against the restored database.
5. Confirm `/health/ready` succeeds and a read-only admin query returns expected collection presence.
6. Record date, snapshot ID, duration, and operator in the verification ledger; destroy the temporary restore target.

## Emergency restore

1. Declare incident and freeze writes if corruption/data loss is confirmed.
2. Restore to a new cluster/database name, validate, then cut over connection strings through Render env groups.
3. Rotate credentials after cutover.
4. Document timeline and residual risk for JK-018 post-launch review.
