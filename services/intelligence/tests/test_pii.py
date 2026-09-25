from security.pii import sanitize_metadata, sanitize_pii


def test_sanitize_email():
    text = (
        "Please reach out to support@mycorp.com, john.doe+billing@company.org, "
        "or admin@platform.technology."
    )
    result = sanitize_pii(text)
    assert "support@mycorp.com" not in result
    assert "john.doe+billing@company.org" not in result
    assert "admin@platform.technology" not in result
    assert result == "Please reach out to [REDACTED_EMAIL], [REDACTED_EMAIL], or [REDACTED_EMAIL]."


def test_sanitize_phone():
    text = "Call me at (555) 123-4567 or +1 800-555-0199 for verification."
    result = sanitize_pii(text)
    assert "(555) 123-4567" not in result
    assert "800-555-0199" not in result
    assert "555" not in result
    assert result == "Call me at [REDACTED_PHONE] or [REDACTED_PHONE] for verification."


def test_sanitize_ssn():
    text = "The SSN on record is 000-12-3456."
    result = sanitize_pii(text)
    assert "000-12-3456" not in result
    assert result == "The SSN on record is [REDACTED_SSN]."


def test_sanitize_credit_card():
    text = "Payment card: 4111-2222-3333-4444 and another 5111 5555 6666 7777."
    result = sanitize_pii(text)
    assert "4111-2222-3333-4444" not in result
    assert "5111 5555 6666 7777" not in result
    assert result == "Payment card: [REDACTED_CARD] and another [REDACTED_CARD]."
    # Zero-padded counter IDs should not false-positive as payment cards
    counter = "Order ID: 0000-0000-0000-0001"
    assert sanitize_pii(counter) == counter


def test_sanitize_api_keys():
    text = (
        "OpenAI: sk-proj-abcdefghijklmnopqrstuvwxyz123456, "
        "Anthropic: sk-ant-api03-abcdefghijklmnopqrstuvwxyz123456, "
        "GitHub: ghp_12345678901234567890abc, "
        "AWS: AKIAIOSFODNN7EXAMPLE."
    )
    result = sanitize_pii(text)
    assert "sk-proj-" not in result
    assert "sk-ant-" not in result
    assert "ghp_" not in result
    assert "AKIAIOSFODNN7EXAMPLE" not in result
    assert result.count("[REDACTED_SECRET]") == 4


def test_sanitize_metadata_recursive():
    meta = {
        "author": "alice@company.engineering",
        "nested": {"phone": "(555) 999-8888", "list": ["sk-abcdefghijklmnopqrstuvwxyz123456"]},
        "count": 42,
    }
    cleaned = sanitize_metadata(meta)
    assert cleaned == {
        "author": "[REDACTED_EMAIL]",
        "nested": {"phone": "[REDACTED_PHONE]", "list": ["[REDACTED_SECRET]"]},
        "count": 42,
    }


def test_sanitize_empty_and_benign():
    assert sanitize_pii("") == ""
    assert sanitize_pii(None) is None  # type: ignore
    benign = "Hello world! This note explains our system architecture and microservices design."
    assert sanitize_pii(benign) == benign
