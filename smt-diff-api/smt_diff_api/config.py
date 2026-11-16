"""Settings read from the environment, and the timeout policy.

Two timeouts bound a request:

* the *solver* timeout (milliseconds) is passed to every individual Z3 call;
  a call that runs out yields ``unknown``, never a verdict;
* the *request* timeout (seconds) bounds a whole analysis, which makes many
  solver calls (abduction, coverage, counterfactuals).  The analysis runs in a
  worker process that is killed when the time is up.

Clients may ask for a smaller or larger value per request; it is capped by the
``SMT_DIFF_MAX_*`` settings.
"""

import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


def _int_env(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None or value.strip() == "":
        return default
    try:
        return int(value)
    except ValueError:
        raise ValueError(f"environment variable {name} must be an integer, got {value!r}")


@dataclass(frozen=True)
class Settings:
    api_url: str
    solver_timeout_ms: int
    max_solver_timeout_ms: int
    request_timeout_s: int
    max_request_timeout_s: int
    cache_ttl_s: int

    @classmethod
    def from_env(cls) -> "Settings":
        settings = cls(
            api_url=os.getenv("API_URL", ""),
            solver_timeout_ms=_int_env("SMT_DIFF_SOLVER_TIMEOUT_MS", 10_000),
            max_solver_timeout_ms=_int_env("SMT_DIFF_MAX_SOLVER_TIMEOUT_MS", 60_000),
            request_timeout_s=_int_env("SMT_DIFF_REQUEST_TIMEOUT_S", 60),
            max_request_timeout_s=_int_env("SMT_DIFF_MAX_REQUEST_TIMEOUT_S", 300),
            cache_ttl_s=_int_env("CACHE_TTL", 3600),
        )
        for name in ("solver_timeout_ms", "max_solver_timeout_ms", "request_timeout_s", "max_request_timeout_s", "cache_ttl_s"):
            if getattr(settings, name) <= 0:
                raise ValueError(f"setting {name} must be positive")
        return settings

    def solver_timeout(self, requested_ms: int | None = None) -> int:
        """Return the per-call solver timeout for a request, capped by the maximum."""

        return min(requested_ms or self.solver_timeout_ms, self.max_solver_timeout_ms)

    def request_timeout(self, requested_s: int | None = None) -> int:
        """Return the wall-clock timeout for a request, capped by the maximum."""

        return min(requested_s or self.request_timeout_s, self.max_request_timeout_s)

    def limits(self) -> dict:
        return {
            "solver_timeout_ms": {"default": self.solver_timeout_ms, "max": self.max_solver_timeout_ms},
            "request_timeout_s": {"default": self.request_timeout_s, "max": self.max_request_timeout_s},
            "cache_ttl_s": self.cache_ttl_s,
        }


settings = Settings.from_env()
