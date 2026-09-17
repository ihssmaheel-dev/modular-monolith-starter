# RB-20: MinIO cluster degraded (nodes down, disks offline, space critical)

- **Severity:** SEV-1 (all storage down) | SEV-2 (drive offline / degraded parity / capacity warning)
- **Owner:** infrastructure / platform on-call
- **Last reviewed:** 2026-09-17

## How you notice

- Prometheus alerts fire:
  - `MinioNodeDown`: `up{job="minio"} == 0` for over 3 minutes on an active cluster.
  - `MinioDiskOffline`: `minio_cluster_drives_offline_total > 0` (physical disk failure / mount loss).
  - `MinioDiskSpaceCritical`: usable disk free capacity is below 15%.
- Grafana dashboard: **MinIO Cluster Internals** (`/d/minio-cluster-overview`).
- Users report upload or download timeouts while application servers remain healthy.

## Blast radius

- **Disk offline with parity intact (SEV-2):** Reads and writes continue in degraded mode while erasure coding reconstructs missing chunks.
- **Node down or lost quorum (SEV-1):** All file upload presigning, file downloads, avatar rendering, and background file cleanup halt.

## Triage in 5 minutes

1. Check MinIO container / process liveness:
   ```bash
   curl -f http://127.0.0.1:9000/minio/health/live || echo "MinIO down"
   ```
   Healthy: returns HTTP 200 `OK`.
2. Inspect MinIO cluster topology and drive status via `mc`:
   ```bash
   mc admin info local
   ```
   Healthy: all nodes and drives report `Online`.
3. Check filesystem storage capacity on the host / volume:
   ```bash
   docker exec -it monorepo-minio df -h /data
   ```
   Healthy: `/data` usage is well below 80%.

## Fix paths

1. **Unresponsive MinIO container (local/staging):**
   Restart the MinIO container cleanly:
   ```bash
   docker compose -f docker/docker-compose.yml restart minio
   ```
   Rollback: N/A.
2. **Drive offline due to host mount issue:**
   Verify host volume permissions and remount the underlying storage volume. MinIO automatically initiates background drive healing once reattached.
3. **Storage disk critically full:**
   - Trigger immediate background file cleanup of orphaned uploads:
     Run `FileCleanupWorker` manually or execute file orphan purge.
   - Expand the underlying disk volume or attach additional drives to the MinIO pool.

## Verify

- MinIO health check returns 200:
  ```bash
  curl -I http://127.0.0.1:9000/minio/health/cluster
  ```
  Expected: `HTTP/1.1 200 OK`.
- `minio_cluster_drives_offline_total == 0` and `minio_cluster_nodes_offline_total == 0` in Prometheus.
- Test round-trip upload and metadata verification from the API.

## Escalate when

- Drive corruption prevents erasure code healing (data loss risk).
- Storage pool cannot be expanded before capacity hits 100%.

## After

- [ ] Postmortem linked here.
- [ ] If capacity ran out, adjust `minio_cluster_capacity_usable_free_bytes` alert threshold or configure automated volume expansion.
