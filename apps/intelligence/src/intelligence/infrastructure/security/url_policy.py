from urllib.parse import urlparse

from intelligence.domain.errors.errors import UnsafeStorageUrlError


def assert_allowed_storage_url(url: str, allowed_hosts: tuple[str, ...]) -> None:
    parsed = urlparse(url)
    hostname = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or not hostname or hostname not in allowed_hosts:
        raise UnsafeStorageUrlError("The storage URL is not approved for document ingestion")
