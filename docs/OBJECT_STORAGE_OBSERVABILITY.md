# Object Storage Observability Guide: MinIO & Multi-Cloud Providers

This guide outlines the dual-layer observability architecture for object storage in the modular monolith starter, detailing how to monitor local and self-hosted **MinIO** alongside cloud-hosted S3 providers such as **Cloudflare R2**, **Wasabi Hot Cloud Storage**, and **AWS S3**.

---

## 1. The Multi-Cloud Observability Problem

When deploying a production application, object storage backends vary across environments:

- **Local development & CI**: Docker-based MinIO.
- **Staging / Cost-Sensitive Production**: Cloudflare R2 (zero egress fees) or Wasabi.
- **Enterprise / VPC Deployments**: AWS S3, Google Cloud Storage, or self-hosted MinIO clusters.

### Why MinIO-Only Dashboards Fail on Cloud Providers

The official MinIO Grafana Dashboard (and Prometheus v2/v3 scrape targets) queries internal metrics (`minio_cluster_*`) exported by the MinIO server daemon via `/minio/v2/metrics/cluster`.

**Managed cloud providers (Cloudflare R2, Wasabi, AWS S3) do NOT run MinIO daemons.**
If an application boilerplate only provides a MinIO Prometheus scrape job and a MinIO-specific dashboard, the moment a team configures Cloudflare R2 or Wasabi, the MinIO dashboard displays **100% "No Data"**, blinding operators to storage latency, throughput, and error rates.

---

## 2. Dual-Layer Observability Architecture

To solve this dilemma, the starter employs a **Dual-Layer Observability Model**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          LAYER 1: UNIVERSAL APPLICATION METRICS             │
│                      (Grafana: Object Storage (Universal))                  │
├─────────────────────────────────────────────────────────────────────────────┤
│  • Emitted directly by StorageService in apps/api                           │
│  • Covers ~95% of operational needs out of the box                          │
│  • Works identically across MinIO, Cloudflare R2, Wasabi, and AWS S3        │
│  • Golden Signals: ops/sec, p50/p95/p99 latency, error codes, transfer bytes│
│  • Resiliency: circuit breaker state (0/1/2) and bulkhead in-flight tracking│
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                    Is the backend self-hosted MinIO?
                                       │
                      ┌────────────────┴────────────────┐
                     YES                               NO (R2 / Wasabi / S3)
                      │                                 │
                      ▼                                 ▼
┌──────────────────────────────────────────┐  ┌──────────────────────────────────────────┐
│        LAYER 2: MINIO CLUSTER INTERNALS  │  │        LAYER 3: CLOUD PROVIDER RECIPES   │
│   (Grafana: MinIO Cluster Internals)     │  │   (Optional cloud integrations)          │
├──────────────────────────────────────────┤  ├──────────────────────────────────────────┤
│  • Scrapes /minio/v2/metrics/cluster     │  │  • Layer 1 covers all app operations     │
│  • Physical disk & node online/offline   │  │  • Cloudflare: R2 Analytics or Logpush   │
│  • Raw drive volume capacity (total/free)│  │  • Wasabi: Wasabi CloudWatch-compat API  │
│  • Parity & erasure coding healing status│  │  • AWS S3: Optional YACE exporter         │
└──────────────────────────────────────────┘  └──────────────────────────────────────────┘
```

---

## 3. Layer 1: Universal Application Metrics

Every storage operation initiated by the application flows through `StorageService` (`apps/api/src/infrastructure/storage/storage.service.ts`). Operations are wrapped with `StorageMetricsRecorder` to emit consistent Prometheus metrics.

### Emitted Metrics

| Metric Name                          | Type      | Labels                                | Description                                                             |
| ------------------------------------ | --------- | ------------------------------------- | ----------------------------------------------------------------------- |
| `storage_operations_total`           | Counter   | `operation`, `provider`, `status`     | Total storage operations (`status="success\|error"`)                    |
| `storage_operation_duration_seconds` | Histogram | `operation`, `provider`               | Operation latency (buckets: 50ms, 100ms, 250ms, 500ms, 1s, 2s, 5s, 10s) |
| `storage_bytes_transferred_total`    | Counter   | `direction`, `provider`               | Direct payload bytes (`direction="in\|out"`)                            |
| `storage_errors_total`               | Counter   | `error_code`, `operation`, `provider` | Storage error count by normalized error code                            |
| `circuit_breaker_state`              | Gauge     | `name="storage"`                      | Circuit breaker state (`0=CLOSED`, `1=HALF_OPEN`, `2=OPEN`)             |
| `circuit_breaker_trips_total`        | Counter   | `name="storage"`                      | Total times the storage circuit breaker has tripped                     |
| `bulkhead_inflight`                  | Gauge     | `name="storage"`                      | Current concurrent requests active in the storage bulkhead              |

### Strict Cardinality Protection

To prevent Prometheus memory exhaustion and comply with `MetricsService.assertLabelNames`:

- `provider` is restricted to the closed set: `"minio" | "r2" | "wasabi" | "s3" | "b2" | "other"`.
- `operation` is restricted to: `"upload" | "presign_upload" | "presign_download" | "delete" | "copy" | "metadata" | "download_stream"`.
- `error_code` is normalized to a closed set (e.g. `UPLOAD_FAILED`, `NOT_FOUND`, `CIRCUIT_OPEN`).
- **CRITICAL**: Never add `tenantId`, `userId`, `bucket`, or `key` as metric labels. High-cardinality values belong exclusively in structured Pino logs.

---

## 4. Layer 2: Self-Hosted MinIO Monitoring

When using MinIO locally or in self-hosted deployments, Prometheus scrapes MinIO's cluster metrics to populate the **MinIO Cluster Internals** dashboard (`minio-cluster-overview`).

### Local Development (`docker/docker-compose.yml`)

In local Docker Compose, MinIO runs with unauthenticated Prometheus scraping enabled:

```yaml
environment:
  MINIO_ROOT_USER: minioadmin
  MINIO_ROOT_PASSWORD: minioadmin
  MINIO_PROMETHEUS_AUTH_TYPE: "public"
```

Prometheus scrapes `http://minio:9000/minio/v2/metrics/cluster` via the shared Docker network.

### Production MinIO Deployments

> [!CAUTION]
> **Never set `MINIO_PROMETHEUS_AUTH_TYPE: "public"` in production.**
> Public scraping exposes drive counts, node topology, and traffic volume to unauthorized network callers.

In production, generate a dedicated Prometheus service account using the MinIO client (`mc`):

```bash
# 1. Alias the production MinIO cluster
mc alias set prod https://minio.internal.example.com admin-user secure-password

# 2. Generate a Prometheus scrape configuration with a bearer token
mc admin prometheus generate prod
```

Then configure `docker/observability/prometheus/prometheus.prod.yml` with the generated bearer token:

```yaml
scrape_configs:
  - job_name: "minio"
    scrape_interval: 30s
    sample_limit: 30000
    metrics_path: "/minio/v2/metrics/cluster"
    bearer_token_file: "/run/secrets/minio_metrics_token"
    static_configs:
      - targets: ["minio.internal.example.com:9000"]
```

---

## 5. Layer 3: Cloud Provider Integration Recipes

For cloud providers, **Layer 1 metrics cover ~95% of operational needs** directly inside Grafana. If additional server-side telemetry is desired, use the optional recipes below.

### A. Cloudflare R2

- **Layer 1 Coverage**: `storage_operations_total`, `storage_operation_duration_seconds`, and `circuit_breaker_state` are fully active with `provider="r2"`.
- **Edge Analytics**: View Class A operations (writes/lists), Class B operations (reads), and storage size directly in the Cloudflare Dashboard under **R2 > Overview > Metrics**.
- **Optional - Logpush to Loki**:
  Cloudflare R2 supports Logpush to push S3 bucket access logs to HTTP endpoints. You can stream R2 access logs directly into the starter's existing **Loki** service (`http://loki:3100`):
  1. In Cloudflare Dashboard, configure **R2 > Logpush**.
  2. Target: HTTP endpoint pointing to your public Loki ingestion proxy.
  3. Filter logs in Grafana Explore via `{service="cloudflare-r2"}` to inspect presigned direct upload completions.

### B. Wasabi Hot Cloud Storage

- **Layer 1 Coverage**: Fully active with `provider="wasabi"`.
- **Console Analytics**: View active storage, deleted storage (under minimum retention period), and API call volume directly in the Wasabi Management Console under **Bucket Usage**.
- **Optional - Wasabi Metrics API**: Wasabi provides CloudWatch-compliant monitoring endpoints. If desired, configure Prometheus YACE with the Wasabi endpoint (`https://monitor.wasabisys.com`).

### C. AWS S3

- **Layer 1 Coverage**: Fully active with `provider="s3"`.
- **Optional - YACE (Yet Another CloudWatch Exporter)**:
  If server-side bucket size (`BucketSizeBytes`) or daily object counts (`NumberOfObjects`) are needed inside Grafana:
  1. Add `yace` to `docker/docker-compose.prod.observability.yml`:
     ```yaml
     yace:
       image: ghcr.io/nerdswords/yet-another-cloudwatch-exporter:v0.60.0
       profiles: [observability]
       environment:
         AWS_REGION: us-east-1
       volumes:
         - ./observability/yace/config.yml:/tmp/config.yml:ro
     ```
  2. Scrape `yace:5000` in `prometheus.prod.yml`.

---

## 6. Prometheus Alerts & Runbook Mappings

Every storage alert maps to a documented runbook in `docs/runbooks/`:

| Alert                       | Group                         | Severity   | Runbook                                           | Trigger Condition                            |
| --------------------------- | ----------------------------- | ---------- | ------------------------------------------------- | -------------------------------------------- |
| `StorageHighErrorRate`      | `object-storage-health`       | `warning`  | [RB-09](runbooks/RB-09-uploads-failing.md)        | Storage operation error rate > 2% over 5m    |
| `StorageHighLatencyP95`     | `object-storage-health`       | `warning`  | [RB-09](runbooks/RB-09-uploads-failing.md)        | Storage p95 latency > 2 seconds over 5m      |
| `StorageCircuitBreakerOpen` | `object-storage-health`       | `critical` | [RB-09](runbooks/RB-09-uploads-failing.md)        | `circuit_breaker_state{name="storage"} == 2` |
| `MinioNodeDown`             | `minio-infrastructure-health` | `critical` | [RB-20](runbooks/RB-20-minio-cluster-degraded.md) | MinIO target unreachable for 3m (guarded)    |
| `MinioDiskOffline`          | `minio-infrastructure-health` | `critical` | [RB-20](runbooks/RB-20-minio-cluster-degraded.md) | `minio_cluster_drives_offline_total > 0`     |
| `MinioDiskSpaceCritical`    | `minio-infrastructure-health` | `critical` | [RB-20](runbooks/RB-20-minio-cluster-degraded.md) | Usable free disk space < 15% for 10m         |

### Disabling MinIO Scrape on Cloud Deploys

When deploying to cloud providers without MinIO, disable or comment out the `minio` scrape job in `prometheus.prod.yml`. The `MinioNodeDown` alert is guarded with `count_over_time(up{job="minio"}[1h]) > 0` to prevent false-page alerts when MinIO is not in use.
