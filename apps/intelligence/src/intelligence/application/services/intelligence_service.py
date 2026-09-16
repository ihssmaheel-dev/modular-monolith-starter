import json
import logging
import time

from intelligence.config.settings import Settings
from intelligence.domain.errors.errors import BudgetExceededError
from intelligence.domain.models.embedding import EmbeddingInput, EmbeddingOutput
from intelligence.domain.models.generation import GenerationInput, GenerationOutput, Usage
from intelligence.domain.ports.model_gateway import ModelGateway
from intelligence.infrastructure.observability.metrics import (
    ACTIVE_REQUESTS,
    CONCURRENCY_LIMIT,
    COST,
    LATENCY,
    REQUESTS,
    TOKENS,
)
from intelligence.infrastructure.observability.telemetry import span

logger = logging.getLogger(__name__)


class IntelligenceApplicationService:
    def __init__(self, gateway: ModelGateway, settings: Settings) -> None:
        self.gateway = gateway
        self.settings = settings
        import asyncio

        self._semaphore = asyncio.Semaphore(settings.max_concurrency)
        CONCURRENCY_LIMIT.set(settings.max_concurrency)

    async def generate(self, request: GenerationInput) -> GenerationOutput:
        if len(request.prompt.encode("utf-8")) > self.settings.max_request_bytes:
            raise BudgetExceededError("Prompt exceeds the configured request limit")
        if len(request.context) > self.settings.max_context_items:
            raise BudgetExceededError("Context exceeds the configured item limit")
        if request.max_output_tokens > self.settings.max_output_tokens:
            raise BudgetExceededError("Output exceeds the configured token limit")
        async with self._semaphore:
            ACTIVE_REQUESTS.inc()
            started = time.perf_counter()
            try:
                with span("intelligence.generate"):
                    result = await self.gateway.generate(request)
                if len(result.content.encode("utf-8")) > self.settings.max_request_bytes:
                    raise BudgetExceededError(
                        "Provider output exceeds the configured response limit"
                    )
                self._record_usage(result.usage)
                if request.output_schema:
                    self._validate_structured_output(result.content)
                REQUESTS.labels("generation", "success").inc()
                return result
            except Exception:
                REQUESTS.labels("generation", "failure").inc()
                raise
            finally:
                LATENCY.labels("generation").observe(time.perf_counter() - started)
                ACTIVE_REQUESTS.dec()

    async def embed(self, request: EmbeddingInput) -> EmbeddingOutput:
        if not request.texts or len(request.texts) > self.settings.max_context_items:
            raise BudgetExceededError("Embedding batch exceeds the configured limit")
        if (
            sum(len(text.encode("utf-8")) for text in request.texts)
            > self.settings.max_request_bytes
        ):
            raise BudgetExceededError("Embedding request exceeds the configured byte limit")
        async with self._semaphore:
            ACTIVE_REQUESTS.inc()
            started = time.perf_counter()
            try:
                with span("intelligence.embed"):
                    result = await self.gateway.embed(request)
                REQUESTS.labels("embedding", "success").inc()
                return result
            except Exception:
                REQUESTS.labels("embedding", "failure").inc()
                raise
            finally:
                LATENCY.labels("embedding").observe(time.perf_counter() - started)
                ACTIVE_REQUESTS.dec()

    @staticmethod
    def _validate_structured_output(content: str) -> None:
        try:
            parsed = json.loads(content)
        except json.JSONDecodeError as error:
            raise ValueError("Provider returned non-JSON structured output") from error
        if not isinstance(parsed, dict):
            raise ValueError("Structured output must be a JSON object")

    @staticmethod
    def _record_usage(usage: Usage) -> None:
        TOKENS.labels("input").inc(usage.input_tokens)
        TOKENS.labels("output").inc(usage.output_tokens)
        COST.inc(usage.estimated_cost_usd)
