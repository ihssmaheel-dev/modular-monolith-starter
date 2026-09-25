import re

# Compiled regex patterns for common sensitive PII types
EMAIL_PATTERN = re.compile(
    r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,63}\b",
    re.IGNORECASE,
)
PHONE_PATTERN = re.compile(
    r"(?:(?<!\w)\+?\d{1,3}[-.\s]?)?(?:\(\d{3}\)|\b\d{3})[-.\s]?\d{3}[-.\s]?\d{4}\b"
)
SSN_PATTERN = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")
CREDIT_CARD_PATTERN = re.compile(r"\b[3-6]\d{3}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b")
API_KEY_PATTERN = re.compile(
    r"\b(?:sk-(?:proj-|svcacct-|ant-)?[a-zA-Z0-9_-]{20,}|(?:ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{20,}|(?:AKIA|ASIA)[0-9A-Z]{16}|xox[baprs]-[a-zA-Z0-9-]{10,}|AIza[0-9A-Za-z_-]{35}|ey[a-zA-Z0-9_-]{15,}\.[a-zA-Z0-9_-]{15,}(?:\.[a-zA-Z0-9_-]{10,})?)\b"
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


def sanitize_metadata(val: object) -> object:
    """Recursively sanitize sensitive PII values from metadata dictionaries and lists."""
    if isinstance(val, str):
        return sanitize_pii(val)
    if isinstance(val, dict):
        return {k: sanitize_metadata(v) for k, v in val.items()}
    if isinstance(val, list):
        return [sanitize_metadata(item) for item in val]
    return val
