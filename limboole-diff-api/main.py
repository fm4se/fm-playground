import json
import os
from typing import Any, Dict, Literal, Union

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from limboole_diff import limboole_diff
from limboole_diff.explainer import DEFAULT_MAX_GENERALIZATIONS, explain_witness
from limboole_diff.runner import COVERAGE_BUDGET_S, EXPLAIN_TIMEOUT_S, AnalysisError, AnalysisTimeout, run_with_timeout
from limboole_diff.logging_config import init_logging
from pydantic import BaseModel, Field

init_logging()

import logging

logger = logging.getLogger(__name__)


load_dotenv()

API_URL = os.getenv("API_URL")

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_code_by_permalink(check: str, p: str) -> Union[str, None]:
    try:
        if check == "SATSemDiff" or check == "SAT":
            url = f"{API_URL}api/permalink/?check={check}&p={p}"
            res = requests.get(url)
            code = res.json().get("code")
            return code
    except Exception:
        raise HTTPException(status_code=404, detail="Permalink not found")


def get_metadata_by_permalink(check: str, p: str) -> Union[Dict[str, Any], None]:
    try:
        if check == "SATSemDiff":
            url = f"{API_URL}api/metadata?check={check}&p={p}"
            res = requests.get(url)
            return res.json()
    except Exception:
        raise HTTPException(status_code=404, detail="Permalink not found")


def get_code_by_id(code_id) -> Union[Dict[str, Any], None]:
    try:
        url = f"{API_URL}api/code/{code_id}"
        res = requests.get(url)
        return res.json()
    except Exception:
        raise HTTPException(status_code=404, detail="Permalink not found")


def log_to_db(p: str, result: str):
    try:
        url = f"{API_URL}api/analysis/log"
        payload = {"permalink": p, "result": result}
        headers = {"Content-Type": "application/json"}
        requests.post(url, json=payload, headers=headers)
    except Exception:
        pass


# --------------------------------------------------


class SATDiffRequest(BaseModel):
    """Request model for starting witness enumeration."""

    check: str  # SATSemDiff
    p: str  # Permalink
    analysis: str  # current-vs-left (Not Previous But Current), left-vs-current (Not Current But Previous), common
    filter: str = ""  # Optional filter


class SATDiffResponse(BaseModel):
    """Response model for starting enumeration."""

    specId: str
    witness: str
    # The witness as {variable: value}; None for messages such as the semantic relation.
    assignment: Dict[str, bool] | None = None


class ExplainRequest(BaseModel):
    """Request model for explaining one witness of a difference region."""

    check: str  # SATSemDiff
    p: str  # Permalink
    analysis: Literal["not-current-but-previous", "not-previous-but-current"]
    assignment: Dict[str, bool]  # the witness, as returned in SATDiffResponse.assignment
    max_generalizations: int = Field(default=DEFAULT_MAX_GENERALIZATIONS, ge=1, le=256)


# --------------------------------------------------


@app.get("/run/", response_model=SATDiffResponse)
async def run_sem_analysis(check: str, p: str, analysis: str, filter: str = ""):
    try:

        current_formula = get_code_by_permalink(check, p)
        previous_metadata = get_metadata_by_permalink(check, p)
        left_side_code_id = (
            json.loads(previous_metadata).get("meta", {}).get("leftSideCodeId")
        )
        previous_formula = get_code_by_id(left_side_code_id).get("code")

        if analysis == "not-previous-but-current":
            specId, witness = limboole_diff.store_witness(
                previous_formula, current_formula, analysis=analysis, filter=filter
            )
            if witness is None:
                raise HTTPException(
                    status_code=404,
                    detail="No diff witnesses found",
                )
            # witness = limboole_diff.diff_witness(current_formula, previous_formula)
        elif analysis == "not-current-but-previous":
            specId, witness = limboole_diff.store_witness(
                previous_formula, current_formula, analysis=analysis, filter=filter
            )
            if witness is None:
                raise HTTPException(
                    status_code=404,
                    detail="No diff witnesses found",
                )
        elif analysis == "common-witness":
            specId, witness = limboole_diff.store_witness(
                previous_formula, current_formula, analysis=analysis, filter=filter
            )
            if witness is None:
                raise HTTPException(
                    status_code=404,
                    detail="No common witnesses found",
                )
        elif analysis == "semantic-relation":
            semantic_relation = limboole_diff.semantic_relation(
                current_formula, previous_formula
            )
            if semantic_relation is None:
                raise HTTPException(
                    status_code=404,
                    detail="Could not determine semantic relation",
                )
            log_to_db(
                p,
                json.dumps(
                    {
                        "tool": "SATSemDiff-Run",
                        "analysis": analysis,
                    }
                ),
            )
            return SATDiffResponse(
                specId="semantic-relation", witness=semantic_relation
            )
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid mode: {analysis}. Supported modes: current-vs-left, left-vs-current, common",
            )
        log_to_db(
            p,
            json.dumps(
                {
                    "tool": "SATSemDiff-Run",
                    "analysis": analysis,
                    "specId": specId,
                    "filter": filter,
                }
            ),
        )
        return SATDiffResponse(
            specId=specId, witness=witness, assignment=limboole_diff.parse_assignment(witness)
        )
    except HTTPException:
        raise
    except Exception as e:
        log_to_db(p, json.dumps({"error": str(e)}))
        raise HTTPException(
            status_code=500, detail=f"Error starting enumeration: {str(e)}"
        )


@app.get("/next/{specId}", response_model=SATDiffResponse)
async def get_next_witness(specId: str, p: str):
    try:
        cache_info = limboole_diff.cache_manager.get_cache_info(specId)
        if cache_info is None:
            raise HTTPException(
                status_code=404, detail=f"Cache not found or expired: {specId}"
            )
        next_witness = limboole_diff.get_next_witness(specId)

        if next_witness is None:
            raise HTTPException(
                status_code=404, detail="No more witnesses or cache exhausted"
            )
        log_to_db(
            p,
            json.dumps(
                {
                    "tool": "SATSemDiff-Next",
                    "specId": specId,
                }
            ),
        )
        return SATDiffResponse(
            specId=specId,
            witness=next_witness,
            assignment=limboole_diff.parse_assignment(next_witness),
        )
    except HTTPException:
        raise
    except Exception as e:
        log_to_db(p, json.dumps({"error": str(e)}))
        raise HTTPException(
            status_code=500, detail=f"Error retrieving next witness: {str(e)}"
        )


_EXPLAIN_ERROR_STATUS = {"parse_error": 400, "invalid_witness": 400, "invalid_mode": 400}


@app.post("/explain")
def explain(request: ExplainRequest):
    """Explain a witness of a difference region: abductive explanations and the nearest counterfactual.

    ``not-current-but-previous`` explains models of the previous formula rejected
    by the current one; ``not-previous-but-current`` the converse.
    """

    current_formula = get_code_by_permalink(request.check, request.p)
    previous_metadata = get_metadata_by_permalink(request.check, request.p)
    if current_formula is None or previous_metadata is None:
        raise HTTPException(status_code=404, detail="Permalink not found")
    left_side_code_id = json.loads(previous_metadata).get("meta", {}).get("leftSideCodeId")
    previous_formula = (get_code_by_id(left_side_code_id) or {}).get("code")
    if previous_formula is None:
        raise HTTPException(status_code=404, detail="Previous formula not found")
    try:
        result = run_with_timeout(
            explain_witness,
            EXPLAIN_TIMEOUT_S,
            previous=limboole_diff.sanitize_formula(previous_formula),
            current=limboole_diff.sanitize_formula(current_formula),
            mode=request.analysis,
            assignment=request.assignment,
            max_generalizations=request.max_generalizations,
            coverage_budget_s=COVERAGE_BUDGET_S,
        )
    except AnalysisTimeout as error:
        log_to_db(request.p, json.dumps({"tool": "SATSemDiff-Explain", "error": "timeout"}))
        raise HTTPException(status_code=504, detail=str(error))
    except AnalysisError as error:
        log_to_db(request.p, json.dumps({"tool": "SATSemDiff-Explain", "error": str(error)}))
        raise HTTPException(status_code=500, detail=f"Error explaining witness: {error}")
    if "error" in result:
        raise HTTPException(
            status_code=_EXPLAIN_ERROR_STATUS.get(result["error"]["code"], 400),
            detail=result["error"],
        )
    log_to_db(
        request.p,
        json.dumps({"tool": "SATSemDiff-Explain", "analysis": request.analysis}),
    )
    return result


# --------------------------------------------------
