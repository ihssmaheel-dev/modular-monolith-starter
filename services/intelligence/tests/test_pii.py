from security.pii import sanitize_pii


def test_sanitize_email():
    text = "Please reach out to support@mycorp.com or john.doe+billing@company.org."
    result = sanitize_pii(text)
    assert "support@mycorp.com" not in result
    assert "john.doe+billing@company.org" not in result
    assert "[REDACTED_EMAIL]" in result
    assert result == "Please reach out to [REDACTED_EMAIL] or [REDACTED_EMAIL]."


def test_sanitize_phone():
    text = "Call me at (555) 123-4567 or +1 800-555-0199 for verification."
    result = sanitize_pii(text)
    assert "555" in result or "[REDACTED_PHONE]" in result
    assert "[REDACTED_PHONE]" in result


def test_sanitize_ssn():
    text = "The SSN on record is 000-12-3456."
    result = sanitize_pii(text)
    assert "000-12-3456" not in result
    assert "[REDACTED_SSN]" in result


def test_sanitize_credit_card():
    text = "Payment card: 4111-2222-3333-4444 and another 4111 5555 6666 7777."
    result = sanitize_pii(text)
    assert "4111-2222-3333-4444" not in result
    assert "4111 5555 6666 7777" not in result
    assert "[REDACTED_CARD]" in result


def test_sanitize_api_keys():
    text = "OpenAI key: sk-abcdefghijklmnopqrstuvwxyz1234567890 and GitHub: ghp_12345678901234567890abc."
    result = sanitize_pii(text)
    assert "sk-abcdefghijklmnopqrstuvwxyz1234567890" not in result
    assert "ghp_12345678901234567890abc" not in result
    assert "[REDACTED_SECRET]" in result


def test_sanitize_empty_and_benign():
    assert sanitize_pii("") == ""
    assert sanitize_pii(None) is None  # type: ignore
    benign = "Hello world! This note explains our system architecture and microservices design."
    assert sanitize_pii(benign) == benign
