"""Run a CPU-bound analysis in a worker process with a wall-clock timeout.

Z3 calls cannot be interrupted from another thread reliably, so a request
that must finish in bounded time runs in its own process, which is killed when
the time is up.  The worker function must be a module-level function whose
arguments and result can be pickled (Z3 objects cannot: return plain data).
"""

import multiprocessing
import queue as queue_module
import time
from typing import Any, Callable

from smt_diff import ScriptError

# ``fork`` is unsafe in a multi-threaded server (the FastAPI thread pool); the
# fork server forks from a clean single-threaded process with Z3 preloaded.
_METHOD = "forkserver" if "forkserver" in multiprocessing.get_all_start_methods() else "spawn"
_context = multiprocessing.get_context(_METHOD)
if _METHOD == "forkserver":
    _context.set_forkserver_preload(["smt_diff_api.analysis"])

_POLL_S = 0.1


class AnalysisTimeout(Exception):
    """The analysis did not finish within the request timeout."""


class AnalysisError(Exception):
    """The analysis failed with an unexpected error, or the worker died."""


class ScriptFailure(Exception):
    """One of the scripts is ill-formed (``smt_diff.ScriptError`` in the worker)."""

    def __init__(self, message: str, version: str | None) -> None:
        super().__init__(message)
        self.version = version


def _target(result_queue, function: Callable[..., Any], kwargs: dict[str, Any]) -> None:
    # Exceptions are sent back as plain tuples: ScriptError does not unpickle.
    try:
        result_queue.put(("ok", function(**kwargs), None))
    except ScriptError as error:
        result_queue.put(("script_error", str(error), error.version))
    except Exception as error:
        result_queue.put(("error", f"{type(error).__name__}: {error}", None))


def run_with_timeout(function: Callable[..., Any], timeout_s: float, **kwargs: Any) -> Any:
    """Return ``function(**kwargs)`` computed in a worker process, or raise.

    Raises :class:`AnalysisTimeout`, :class:`ScriptFailure` or :class:`AnalysisError`.
    """

    result_queue = _context.Queue()
    process = _context.Process(target=_target, args=(result_queue, function, kwargs), daemon=True)
    process.start()
    deadline = time.monotonic() + timeout_s
    try:
        while True:
            try:
                # Read before joining: a large result blocks the worker until it is consumed.
                status, payload, version = result_queue.get(timeout=_POLL_S)
                break
            except queue_module.Empty:
                if not process.is_alive():
                    try:
                        status, payload, version = result_queue.get(timeout=_POLL_S)
                        break
                    except queue_module.Empty:
                        raise AnalysisError(f"analysis worker exited unexpectedly (exit code {process.exitcode})")
                if time.monotonic() >= deadline:
                    raise AnalysisTimeout(f"analysis timed out after {timeout_s:g} seconds")
    finally:
        if process.is_alive():
            process.join(_POLL_S)
        if process.is_alive():
            process.terminate()
            process.join()
        result_queue.close()
    if status == "script_error":
        raise ScriptFailure(payload, version)
    if status == "error":
        raise AnalysisError(payload)
    return payload
