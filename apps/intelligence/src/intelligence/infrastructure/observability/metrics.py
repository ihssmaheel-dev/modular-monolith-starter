from prometheus_client import CONTENT_TYPE_LATEST, Counter, Gauge, Histogram, generate_latest

REQUESTS = Counter(
    "intelligence_requests_total",
    "Intelligence requests by operation and outcome",
    ("operation", "outcome"),
)
LATENCY = Histogram(
    "intelligence_request_duration_seconds",
    "Intelligence request duration",
    ("operation",),
)
PROVIDER_REQUESTS = Counter(
    "intelligence_provider_requests_total",
    "Provider requests by operation and outcome",
    ("operation", "outcome"),
)
ACTIVE_REQUESTS = Gauge("intelligence_active_requests", "Currently active intelligence requests")
CONCURRENCY_LIMIT = Gauge(
    "intelligence_concurrency_limit", "Configured maximum concurrent intelligence requests"
)
TOKENS = Counter(
    "intelligence_tokens_total",
    "Tokens consumed by direction",
    ("direction",),
)
COST = Counter("intelligence_estimated_cost_usd_total", "Estimated model cost in USD")


def metrics_response() -> tuple[bytes, str]:
    return generate_latest(), CONTENT_TYPE_LATEST
