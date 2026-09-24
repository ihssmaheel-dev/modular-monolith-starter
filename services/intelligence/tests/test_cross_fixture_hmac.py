from security.hmac import compute_signature

CHECKED_IN_NODE_VECTOR_1 = "b7583a90fd2f39885baa773ba7ac6f7676a26e2c1ef023da45384354d7ea6a03"
CHECKED_IN_NODE_VECTOR_2 = "62a60fb53fe256d90ce51e65b65e7301050e2bfb3110f2e657a4f7c128b943c0"


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

    # Cryptographically assert against hardcoded vector computed by Node.js crypto
    assert py_sig == CHECKED_IN_NODE_VECTOR_1
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

    # Cryptographically assert against hardcoded single-mode vector computed by Node.js crypto
    assert py_sig == CHECKED_IN_NODE_VECTOR_2
