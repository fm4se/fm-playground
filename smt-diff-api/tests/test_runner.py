import os
import time

import pytest
from smt_diff_api.analysis import analyze_scripts
from smt_diff_api.config import Settings
from smt_diff_api.runner import AnalysisError, AnalysisTimeout, ScriptFailure, run_with_timeout


def sleep_for(seconds: float) -> str:
    time.sleep(seconds)
    return "done"


def crash() -> None:
    os._exit(3)


def test_result_is_returned():
    assert run_with_timeout(sleep_for, 10, seconds=0) == "done"


def test_timeout_kills_worker():
    start = time.monotonic()
    with pytest.raises(AnalysisTimeout):
        run_with_timeout(sleep_for, 1, seconds=30)
    assert time.monotonic() - start < 5


def test_crashed_worker():
    with pytest.raises(AnalysisError, match="exit code 3"):
        run_with_timeout(crash, 10)


def test_script_error_is_reported_with_version():
    with pytest.raises(ScriptFailure) as error:
        run_with_timeout(
            analyze_scripts, 30, previous="(assert", current="(assert true)",
            matching="align", encoding="direct", explain=False, solver_timeout_ms=1000,
        )
    assert error.value.version == "A"


def test_timeouts_are_capped():
    settings = Settings("", 10_000, 60_000, 60, 300, 3600)
    assert settings.solver_timeout() == 10_000
    assert settings.solver_timeout(500) == 500
    assert settings.solver_timeout(10**9) == 60_000
    assert settings.request_timeout() == 60
    assert settings.request_timeout(1000) == 300
