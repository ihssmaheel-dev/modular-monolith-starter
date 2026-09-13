import json
import logging
import sys
from datetime import datetime, timezone
from typing import Any


class JsonFormatter(logging.Formatter):
    """Formats log records as structured JSON compatible with Pino and Loki."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "time": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "module": record.name,
            "msg": record.getMessage(),
        }

        if hasattr(record, "extra") and isinstance(record.extra, dict):
            payload.update(record.extra)

        if record.exc_info:
            payload["err"] = self.formatException(record.exc_info)

        return json.dumps(payload)


def configure_logging(level: str = "INFO") -> logging.Logger:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())

    root_logger = logging.getLogger("intelligence")
    root_logger.setLevel(level.upper())
    root_logger.handlers = [handler]
    root_logger.propagate = False

    return root_logger


logger = configure_logging()
