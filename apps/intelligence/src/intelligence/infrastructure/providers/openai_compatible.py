import asyncio
import json
import logging
import time
from typing import Any, cast

import httpx

from intelligence.config.settings import Settings
from intelligence.domain.errors.errors import (
    CircuitOpenError,
    InvalidProviderResponseError,
    ProviderTimeoutError,
    ProviderUnavailableError,
)
from intelligence.domain.models.embedding import EmbeddingInput, EmbeddingOutput
from intelligence.domain.models.generation import GenerationInput, GenerationOutput, Usage
from intelligence.infrastructure.observability.metrics import PROVIDER_REQUESTS

logger = logging.getLogger(__name__)


class ProviderCircuit:
    def __init__(self, failure_limit: int = 5, reset_seconds: float = 30.0) -> None:
        self.failure_limit = failure_limit
        self.reset_seconds = reset_seconds
        self.failures = 0
        self.opened_at: float | None = None

    def allow(self) -> bool:
        if self.opened_at is None:
            return True
        if time.monotonic() - self.opened_at >= self.reset_seconds:
            self.opened_at = None
            self.failures = 0
            return True
        return False

    def success(self) -> None:
        self.failures = 0
        self.opened_at = None

    def failure(self) -> None:
        self.failures += 1
        if self.failures >= self.failure_limit:
            self.opened_at = time.monotonic()


class OpenAICompatibleGateway:
    def __init__(self, settings: Settings) -> None:
        if settings.provider_base_url is None:
            raise ValueError("Provider base URL is required")
        self.settings = settings
        self.client = httpx.AsyncClient(
            base_url=str(settings.provider_base_url).rstrip("/"),
            headers={"authorization": f"Bearer {settings.provider_api_key}"},
            timeout=httpx.Timeout(settings.request_timeout_seconds),
            limits=httpx.Limits(
                max_connections=settings.max_concurrency, max_keepalive_connections=4
            ),
        )
        self.circuit = ProviderCircuit()

    async def close(self) -> None:
        await self.client.aclose()

    async def generate(self, request: GenerationInput) -> GenerationOutput:
        payload: dict[str, Any] = {
            "model": self.settings.model,
            "messages": [
                {"role": "system", "content": "Use only the supplied context. Cite sources."},
                {"role": "user", "content": self._prompt_with_context(request)},
            ],
            "max_tokens": request.max_output_tokens,
            "temperature": 0,
        }
        if request.output_schema:
            payload["response_format"] = {
                "type": "json_schema",
                "json_schema": {"name": "structured_output", "schema": request.output_schema},
            }
        data = await self._post("/chat/completions", payload, "generation")
        try:
            choice = data["choices"][0]["message"]["content"]
            usage_data = data.get("usage", {})
            content = str(choice)
            usage = Usage(
                input_tokens=int(usage_data.get("prompt_tokens", 0)),
                output_tokens=int(usage_data.get("completion_tokens", 0)),
                estimated_cost_usd=0.0,
            )
            citations = tuple(
                item.citation_id for item in request.context if item.citation_id in content
            )
            return GenerationOutput(
                content, usage, str(data.get("model", self.settings.model)), citations
            )
        except (KeyError, IndexError, TypeError, ValueError) as error:
            raise InvalidProviderResponseError(
                "Provider response did not match the expected shape"
            ) from error

    async def embed(self, request: EmbeddingInput) -> EmbeddingOutput:
        data = await self._post(
            "/embeddings",
            {"model": self.settings.embedding_model, "input": list(request.texts)},
            "embedding",
        )
        try:
            vectors = tuple(
                tuple(float(value) for value in item["embedding"]) for item in data["data"]
            )
            if len(vectors) != len(request.texts):
                raise ValueError("embedding count mismatch")
            return EmbeddingOutput(str(data.get("model", self.settings.embedding_model)), vectors)
        except (KeyError, TypeError, ValueError) as error:
            raise InvalidProviderResponseError("Provider embedding response was invalid") from error

    async def _post(self, path: str, payload: dict[str, Any], operation: str) -> dict[str, Any]:
        if not self.circuit.allow():
            PROVIDER_REQUESTS.labels(operation, "circuit_open").inc()
            raise CircuitOpenError("Provider circuit is open")
        for attempt in range(self.settings.max_retries + 1):
            try:
                response = await self.client.post(path, json=payload)
                response.raise_for_status()
                if len(response.content) > self.settings.max_request_bytes:
                    raise InvalidProviderResponseError(
                        "Provider response exceeded the configured limit"
                    )
                data = response.json()
                if not isinstance(data, dict):
                    raise TypeError("provider response was not an object")
                self.circuit.success()
                PROVIDER_REQUESTS.labels(operation, "success").inc()
                return cast(dict[str, Any], data)
            except httpx.TimeoutException as error:
                self.circuit.failure()
                PROVIDER_REQUESTS.labels(operation, "timeout").inc()
                if attempt >= self.settings.max_retries:
                    raise ProviderTimeoutError("Provider request timed out") from error
            except httpx.HTTPStatusError as error:
                status_code = error.response.status_code
                retryable = status_code == 408 or status_code == 429 or status_code >= 500
                self.circuit.failure() if retryable else self.circuit.success()
                PROVIDER_REQUESTS.labels(operation, "failure").inc()
                if not retryable or attempt >= self.settings.max_retries:
                    logger.warning(
                        "provider request failed operation=%s status=%s", operation, status_code
                    )
                    raise ProviderUnavailableError("Provider request failed") from error
            except (httpx.HTTPError, TypeError, json.JSONDecodeError) as error:
                self.circuit.failure()
                PROVIDER_REQUESTS.labels(operation, "failure").inc()
                if attempt >= self.settings.max_retries:
                    logger.warning("provider request failed operation=%s", operation)
                    raise ProviderUnavailableError("Provider request failed") from error
            await asyncio.sleep(min(2**attempt, 8))
        raise ProviderUnavailableError("Provider request failed")

    @staticmethod
    def _prompt_with_context(request: GenerationInput) -> str:
        context = "\n\n".join(f"[{item.citation_id}] {item.content}" for item in request.context)
        return f"Context:\n{context}\n\nRequest:\n{request.prompt}"
