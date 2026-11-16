"""Client for the FM Playground backend: permalinks and analysis logs."""

import json
from typing import Any

import requests
from fastapi import HTTPException

from .config import settings

_TIMEOUT_S = 30


def get_code_by_permalink(check: str, p: str) -> str | None:
    try:
        if check == "SMTSemDiff" or check == "SMT":
            res = requests.get(f"{settings.api_url}api/permalink/?check={check}&p={p}", timeout=_TIMEOUT_S)
            return res.json().get("code")
    except Exception:
        raise HTTPException(status_code=404, detail="Permalink not found")
    return None


def get_metadata_by_permalink(check: str, p: str) -> Any:
    try:
        if check == "SMTSemDiff":
            res = requests.get(f"{settings.api_url}api/metadata?check={check}&p={p}", timeout=_TIMEOUT_S)
            return res.json()
    except Exception:
        raise HTTPException(status_code=404, detail="Permalink not found")
    return None


def get_code_by_id(code_id) -> dict[str, Any] | None:
    try:
        res = requests.get(f"{settings.api_url}api/code/{code_id}", timeout=_TIMEOUT_S)
        return res.json()
    except Exception:
        raise HTTPException(status_code=404, detail="Permalink not found")


def fetch_scripts(check: str, p: str) -> tuple[str, str]:
    """Return ``(previous, current)``: the compared code and the code of the permalink."""

    current = get_code_by_permalink(check, p)
    metadata = get_metadata_by_permalink(check, p)
    try:
        left_side_code_id = json.loads(metadata).get("meta", {}).get("leftSideCodeId")
        previous = get_code_by_id(left_side_code_id).get("code")
    except (TypeError, ValueError, AttributeError):
        raise HTTPException(status_code=404, detail="Compared script not found for this permalink")
    if current is None or previous is None:
        raise HTTPException(status_code=404, detail="Permalink not found")
    return previous, current


def log_to_db(p: str | None, result: str) -> None:
    if not p:
        return
    try:
        requests.post(
            f"{settings.api_url}api/analysis/log",
            json={"permalink": p, "result": result},
            headers={"Content-Type": "application/json"},
            timeout=_TIMEOUT_S,
        )
    except Exception:
        pass
