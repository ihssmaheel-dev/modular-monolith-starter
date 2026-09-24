import re

# Compiled regex patterns for common sensitive PII types
EMAIL_PATTERN = re.compile(
    r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,7}\b",
    re.IGNORECASE,
)
PHONE_PATTERN = re.compile(r"\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b")
SSN_PATTERN = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")
CREDIT_CARD_PATTERN = re.compile(r"\b(?:\d{4}[-\s]?){3}\d{4}\b")
API_KEY_PATTERN = re.compile(
    r"\b(?:sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{20,}|ey[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,})\b"
)


def sanitize_pii(text: str) -> str:
    """
    Sanitize sensitive Personally Identifiable Information (PII) and secret credentials
    before text is ingested into vector embeddings or forwarded to upstream LLMs.
    """
    if not text:
        return text

    sanitized = EMAIL_PATTERN.sub("[REDACTED_EMAIL]", text)
    sanitized = PHONE_PATTERN.sub("[REDACTED_PHONE]", sanitized)
    sanitized = SSN_PATTERN.sub("[REDACTED_SSN]", sanitized)
    sanitized = CREDIT_CARD_PATTERN.sub("[REDACTED_CARD]", sanitized)
    sanitized = API_KEY_PATTERN.sub("[REDACTED_SECRET]", sanitized)

    return sanitized
