import pytest

from intelligence.domain.errors.errors import UnsafeStorageUrlError
from intelligence.infrastructure.security.url_policy import assert_allowed_storage_url


def test_storage_policy_requires_https_and_allowlisted_host() -> None:
    assert_allowed_storage_url("https://objects.example.test/signed", ("objects.example.test",))


@pytest.mark.parametrize(
    "url",
    ["http://objects.example.test/signed", "https://evil.example.test/signed"],
)
def test_storage_policy_rejects_ssrf_targets(url: str) -> None:
    with pytest.raises(UnsafeStorageUrlError):
        assert_allowed_storage_url(url, ("objects.example.test",))
