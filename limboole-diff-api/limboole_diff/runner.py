"""Run an explanation in a worker process with a wall-clock timeout.

SAT and MaxSAT calls (RC2) cannot be interrupted reliably from another thread,
so a request that must finish in bounded time runs in its own process, which is
killed when the time is up.  The worker function must be a module-level
function whose arguments and result can be pickled.
"""

import multiprocessing
import os
import queue as queue_module
import time
from typing import Any, Callable

# ``fork`` is unsafe in a multi-threaded server (the FastAPI thread pool); the
# fork server forks from a clean single-threaded process with PySAT preloaded.
_METHOD = "forkserver" if "forkserver" in multiprocessing.get_all_start_methods() else "spawn"
_context = multiprocessing.get_context(_METHOD)
if _METHOD == "forkserver":
    _context.set_forkserver_preload(["limboole_diff.explainer"])

_POLL_S = 0.1

EXPLAIN_TIMEOUT_S: float = float(os.getenv("LIMBOOLE_DIFF_EXPLAIN_TIMEOUT_S", "30"))
COVERAGE_BUDGET_S: float = float(os.getenv("LIMBOOLE_DIFF_COVERAGE_BUDGET_S", "10"))


class AnalysisTimeout(Exception):
    """The computation did not finish within the timeout."""


class AnalysisError(Exception):
    """The computation failed with an unexpected error, or the worker died."""


def _target(result_queue, function: Callable[..., Any], kwargs: dict[str, Any]) -> None:
    try:
        result_queue.put(("ok", function(**kwargs)))
    except Exception as error:
        result_queue.put(("error", f"{type(error).__name__}: {error}"))


def run_with_timeout(function: Callable[..., Any], timeout_s: float, **kwargs: Any) -> Any:
    """Return ``function(**kwargs)`` computed in a worker process; raises AnalysisTimeout/AnalysisError."""

    result_queue = _context.Queue()
    process = _context.Process(target=_target, args=(result_queue, function, kwargs), daemon=True)
    process.start()
    deadline = time.monotonic() + timeout_s
    try:
        while True:
            try:
                # Read before joining: a large result blocks the worker until it is consumed.
                status, payload = result_queue.get(timeout=_POLL_S)
                break
            except queue_module.Empty:
                if not process.is_alive():
                    try:
                        status, payload = result_queue.get(timeout=_POLL_S)
                        break
                    except queue_module.Empty:
                        raise AnalysisError(f"worker exited unexpectedly (exit code {process.exitcode})")
                if time.monotonic() >= deadline:
                    raise AnalysisTimeout(f"the explanation timed out after {timeout_s:g} seconds")
    finally:
        if process.is_alive():
            process.join(_POLL_S)
        if process.is_alive():
            process.terminate()
            process.join()
        result_queue.close()
    if status == "error":
        raise AnalysisError(payload)
    return payload
