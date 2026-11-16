"""In-memory store of witness streams, addressed by a spec id, with a sliding TTL.

Streams hold live Z3 objects, so they cannot be shared between processes:
run the API with a single worker process (or sticky sessions).
"""

import threading
import uuid
from datetime import datetime, timedelta
from typing import Any


class CacheEntry:
    """One cached value with its access time; ``lock`` serializes its use."""

    def __init__(self, value: Any, kind: str, ttl_seconds: int) -> None:
        self.spec_id = str(uuid.uuid4())
        self.value = value
        self.kind = kind
        self.ttl_seconds = ttl_seconds
        self.created_at = datetime.now()
        self.last_accessed = self.created_at
        self.lock = threading.Lock()

    def is_expired(self) -> bool:
        return datetime.now() > self.last_accessed + timedelta(seconds=self.ttl_seconds)

    def to_dict(self) -> dict:
        """Return the entry's metadata (without the cached value)."""

        return {
            "spec_id": self.spec_id,
            "kind": self.kind,
            "created_at": self.created_at.isoformat(),
            "last_accessed": self.last_accessed.isoformat(),
            "ttl_seconds": self.ttl_seconds,
            "expires_at": (self.last_accessed + timedelta(seconds=self.ttl_seconds)).isoformat(),
        }


class WitnessCache:
    """Thread-safe map from spec id to cache entry; expired entries are dropped."""

    def __init__(self) -> None:
        self._entries: dict[str, CacheEntry] = {}
        self._lock = threading.Lock()

    def create(self, value: Any, *, kind: str, ttl_seconds: int) -> str:
        entry = CacheEntry(value, kind, ttl_seconds)
        with self._lock:
            self._cleanup_expired()
            self._entries[entry.spec_id] = entry
        return entry.spec_id

    def get(self, spec_id: str) -> CacheEntry | None:
        """Return a live entry and refresh its TTL, or None."""

        with self._lock:
            entry = self._entries.get(spec_id)
            if entry is None:
                return None
            if entry.is_expired():
                del self._entries[spec_id]
                return None
            entry.last_accessed = datetime.now()
            return entry

    def get_info(self, spec_id: str) -> dict | None:
        entry = self.get(spec_id)
        return entry.to_dict() if entry is not None else None

    def delete(self, spec_id: str) -> bool:
        with self._lock:
            return self._entries.pop(spec_id, None) is not None

    def list(self) -> list[dict]:
        with self._lock:
            self._cleanup_expired()
            return [entry.to_dict() for entry in self._entries.values()]

    def _cleanup_expired(self) -> None:
        for spec_id in [key for key, entry in self._entries.items() if entry.is_expired()]:
            del self._entries[spec_id]


cache = WitnessCache()
