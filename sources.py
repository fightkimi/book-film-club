"""Bounded, read-only metadata transport; no user-supplied hosts or redirects."""
import copy
import hashlib
import threading
import time
from urllib.parse import urlsplit
from domain import Problem

HOSTS = {'openlibrary.org', 'www.googleapis.com', 'api.themoviedb.org', 'api.tmdb.org', 'www.omdbapi.com', 'api.trakt.tv', 'i.weread.qq.com'}
_lock = threading.Lock()
_hosts = {host: threading.Lock() for host in HOSTS}
_cache = {}
_last = {}


def read_json(url, headers=None, ttl=300, payload=None):
    from metadata import fetch_json
    parsed = urlsplit(url)
    if parsed.scheme != 'https' or parsed.hostname not in HOSTS or '@' in parsed.netloc or parsed.port not in (None, 443):
        raise Problem('不支持的数据源地址')
    # Credentials are included only in the hash, never exposed as cache keys or logs.
    key = hashlib.sha256((url + repr(sorted((headers or {}).items())) + repr(payload)).encode()).hexdigest()
    with _hosts[parsed.hostname]:
        with _lock:
            hit = _cache.get(key)
            if hit and hit[0] > time.monotonic():
                return copy.deepcopy(hit[1])
        delay = (1.05 if parsed.hostname == 'openlibrary.org' else .25) - (time.monotonic() - _last.get(parsed.hostname, 0))
        if delay > 0:
            time.sleep(delay)
        _last[parsed.hostname] = time.monotonic()
        result = fetch_json(url, headers, payload) if payload is not None else fetch_json(url, headers)
        with _lock:
            if len(_cache) >= 128:
                _cache.pop(next(iter(_cache)))
            _cache[key] = (time.monotonic() + ttl, copy.deepcopy(result))
        return result
