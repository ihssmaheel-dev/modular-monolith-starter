import hashlib
import hmac

from security.hmac import compute_signature


def test_cross_fixture_node_python_hmac_parity():
    """
    Validates cross-runtime cryptographic parity between Node.js IntelligenceHmacService
    and Python compute_signature using deterministic test vectors.
    """
    secret = "deterministic-test-secret-key-32charsmin"
    method = "POST"
    path = "/api/v1/chat/unary"
    timestamp = "1710000000.0000"
    user_id = "user_cuid_123"
    tenant_id = "tenant_cuid_456"
    request_id = "req_cuid_789"
    body_str = '{"messages":[{"role":"user","content":"test"}]}'
    body_bytes = body_str.encode("utf-8")

    # Manually compute SHA256 body hash matching Node's createHash("sha256").update(body).digest("hex")
    body_hash = hashlib.sha256(body_bytes).hexdigest()

    # Canonical string matching Node format:
    # `${method.toUpperCase()}:${path}:${timestamp}:${userId}:${tenantId}:${requestId}:${bodyHash}`
    expected_canonical = f"POST:/api/v1/chat/unary:1710000000.0000:user_cuid_123:tenant_cuid_456:req_cuid_789:{body_hash}"

    expected_sig = hmac.new(
        secret.encode("utf-8"),
        expected_canonical.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    # Call Python's compute_signature
    py_sig = compute_signature(
        secret=secret,
        method=method,
        path=path,
        timestamp=timestamp,
        body=body_bytes,
        user_id=user_id,
        tenant_id=tenant_id,
        request_id=request_id,
    )

    assert py_sig == expected_sig
    assert len(py_sig) == 64


def test_cross_fixture_single_mode_empty_tenant_parity():
    """Validates signature parity when tenant_id is empty/single mode."""
    secret = "deterministic-test-secret-key-32charsmin"
    method = "POST"
    path = "/api/v1/embeddings/search"
    timestamp = "1710000000.0000"
    user_id = "user_cuid_123"
    tenant_id = ""  # Single-tenant mode passes empty string in header
    request_id = "req_cuid_789"
    body_str = '{"query":"search query","limit":5}'
    body_bytes = body_str.encode("utf-8")

    body_hash = hashlib.sha256(body_bytes).hexdigest()
    expected_canonical = (
        f"POST:/api/v1/embeddings/search:1710000000.0000:user_cuid_123::req_cuid_789:{body_hash}"
    )
    expected_sig = hmac.new(
        secret.encode("utf-8"),
        expected_canonical.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    py_sig = compute_signature(
        secret=secret,
        method=method,
        path=path,
        timestamp=timestamp,
        body=body_bytes,
        user_id=user_id,
        tenant_id=tenant_id,
        request_id=request_id,
    )

    assert py_sig == expected_sig
