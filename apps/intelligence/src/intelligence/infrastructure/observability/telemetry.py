from collections.abc import Generator
from contextlib import contextmanager

from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor


def configure_tracing(endpoint: str | None) -> None:
    provider = TracerProvider(resource=Resource.create({"service.name": "intelligence"}))
    if endpoint:
        provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(endpoint=endpoint)))
    trace.set_tracer_provider(provider)


@contextmanager
def span(name: str) -> Generator[trace.Span, None, None]:
    tracer = trace.get_tracer("modular-monolith-intelligence")
    with tracer.start_as_current_span(name) as current:
        yield current
