import shutil
import subprocess

from security.hmac import compute_signature

CHECKED_IN_NODE_VECTOR_1 = "b7583a90fd2f39885baa773ba7ac6f7676a26e2c1ef023da45384354d7ea6a03"
CHECKED_IN_NODE_VECTOR_2 = "62a60fb53fe256d90ce51e65b65e7301050e2bfb3110f2e657a4f7c128b943c0"


def _compute_live_node_hmac(
    secret: str,
    method: str,
    path: str,
    timestamp: str,
    body: str,
    user_id: str,
    tenant_id: str,
    request_id: str,
) -> str | None:
    """Execute Node.js crypto.createHmac subprocess if node is installed on PATH."""
    node_bin = shutil.which("node")
    if not node_bin:
        return None
    script = (
        "const crypto = require('node:crypto');"
        "const [s, m, p, ts, b, u, t, r] = process.argv.slice(1);"
        "const bh = crypto.createHash('sha256').update(b, 'utf8').digest('hex');"
        "const cp = `${m.toUpperCase()}:${p}:${ts}:${u}:${t}:${r}:${bh}`;"
        "process.stdout.write(crypto.createHmac('sha256', s).update(cp, 'utf8').digest('hex'));"
    )
    res = subprocess.run(
        [
            node_bin,
            "-e",
            script,
            secret,
            method,
            path,
            timestamp,
            body,
            user_id,
            tenant_id,
            request_id,
        ],
        capture_output=True,
        text=True,
        check=True,
        timeout=5,
    )
    return res.stdout.strip()


def test_cross_fixture_node_python_hmac_parity():
    """
    Validates cross-runtime cryptographic parity between Node.js IntelligenceHmacService
    and Python compute_signature using both checked-in vectors and live Node execution.
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

    assert py_sig == CHECKED_IN_NODE_VECTOR_1
    assert len(py_sig) == 64

    live_node_sig = _compute_live_node_hmac(
        secret, method, path, timestamp, body_str, user_id, tenant_id, request_id
    )
    if live_node_sig is not None:
        assert py_sig == live_node_sig


def test_cross_fixture_single_mode_empty_tenant_parity():
    """Validates signature parity when tenant_id is empty/single mode."""
    secret = "deterministic-test-secret-key-32charsmin"
    method = "POST"
    path = "/api/v1/embeddings/search"
    timestamp = "1710000000.0000"
    user_id = "user_cuid_123"
    tenant_id = ""
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

    assert py_sig == CHECKED_IN_NODE_VECTOR_2
    assert len(py_sig) == 64

    live_node_sig = _compute_live_node_hmac(
        secret, method, path, timestamp, body_str, user_id, tenant_id, request_id
    )
    if live_node_sig is not None:
        assert py_sig == live_node_sig
