import json
from typing import Any, Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from smt_diff import Relation, ScriptError
from smt_diff_api import analysis as workers
from smt_diff_api import backend, legacy
from smt_diff_api.cache import cache
from smt_diff_api.config import settings
from smt_diff_api.runner import AnalysisError, AnalysisTimeout, ScriptFailure, run_with_timeout
from smt_diff_api.serialize import SIDES, query_to_dict, witness_to_dict
from smt_diff_api.witnesses import FilterError, InvalidPair, WitnessStream, open_stream

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ScriptSource(BaseModel):
    """The two scripts, given directly or through a permalink of the playground."""

    check: str | None = None  # SMTSemDiff
    p: str | None = None  # Permalink
    previous: str | None = None
    current: str | None = None


class AnalyzeRequest(ScriptSource):
    matching: Literal["align", "positional"] = "align"
    encoding: Literal["direct", "selectors"] = "direct"
    explain: bool = True
    solver_timeout_ms: int | None = Field(default=None, gt=0)
    timeout_s: int | None = Field(default=None, gt=0)


class WitnessRequest(ScriptSource):
    mode: Literal["tightening", "relaxation", "common"]
    pair: int = Field(default=0, ge=0)
    matching: Literal["align", "positional"] = "align"
    filter: str = ""
    solver_timeout_ms: int | None = Field(default=None, gt=0)


class ExplainRequest(ScriptSource):
    mode: Literal["tightening", "relaxation"]
    witness: int = Field(default=0, ge=0)  # index of the witness in the enumeration, from 0
    pair: int | None = Field(default=None, ge=0)  # None: the last query of each script, as /run
    matching: Literal["align", "positional"] = "align"
    filter: str = ""
    solver_timeout_ms: int | None = Field(default=None, gt=0)
    timeout_s: int | None = Field(default=None, gt=0)


class SmtDiffResponse(BaseModel):
    """Legacy response of /run and /next with format=html."""

    specId: str
    witness: str


OutputFormat = Literal["html", "json"]


def resolve_scripts(source: ScriptSource) -> tuple[str, str]:
    if source.previous is not None and source.current is not None:
        return source.previous, source.current
    if source.check and source.p:
        return backend.fetch_scripts(source.check, source.p)
    raise HTTPException(status_code=422, detail="Provide either 'previous' and 'current', or 'check' and 'p'")


def error_detail(code: str, message: str, script: str | None = None) -> dict[str, Any]:
    """Detail of an HTTP error: ``code``, ``message`` and the offending ``script`` (previous/current) if any."""

    return {"code": code, "message": message, "script": script}


def script_error_detail(message: str, version: str | None) -> dict[str, Any]:
    return error_detail("parse_error", message.removeprefix(f"version {version}: "), SIDES.get(version or ""))


# --------------------------------------------------


@app.get("/health")
def health():
    return {"status": "UP"}


@app.get("/limits")
def limits():
    return settings.limits()


@app.post("/analyze")
def analyze(request: AnalyzeRequest):
    """Compare the scripts query by query, with witnesses, abductive explanations and counterfactuals."""

    previous, current = resolve_scripts(request)
    solver_timeout_ms = settings.solver_timeout(request.solver_timeout_ms)
    timeout_s = settings.request_timeout(request.timeout_s)
    try:
        result = run_with_timeout(
            workers.analyze_scripts, timeout_s,
            previous=previous, current=current, matching=request.matching, encoding=request.encoding,
            explain=request.explain, solver_timeout_ms=solver_timeout_ms,
        )
    except ScriptFailure as error:
        raise HTTPException(status_code=400, detail=script_error_detail(str(error), error.version))
    except AnalysisTimeout as error:
        backend.log_to_db(request.p, json.dumps({"tool": "SMTSemDiff-Analyze", "error": "timeout"}))
        raise HTTPException(status_code=504, detail=error_detail("timeout", str(error)))
    except AnalysisError as error:
        backend.log_to_db(request.p, json.dumps({"tool": "SMTSemDiff-Analyze", "error": str(error)}))
        raise HTTPException(status_code=500, detail=error_detail("internal_error", f"Error analyzing scripts: {error}"))
    backend.log_to_db(request.p, json.dumps({"tool": "SMTSemDiff-Analyze", "equivalent": result["equivalent"]}))
    result["limits"] = {"solver_timeout_ms": solver_timeout_ms, "timeout_s": timeout_s}
    return result


@app.post("/witnesses")
def start_witnesses(request: WitnessRequest):
    """Start enumerating the models of one pair and region; returns the first one."""

    previous, current = resolve_scripts(request)
    try:
        stream = open_stream(
            previous, current, request.mode, pair=request.pair, matching=request.matching,
            filter=request.filter, solver_timeout_ms=settings.solver_timeout(request.solver_timeout_ms),
        )
        model = stream.next()
    except ScriptError as error:
        raise HTTPException(status_code=400, detail=script_error_detail(str(error), error.version))
    except FilterError as error:
        raise HTTPException(status_code=400, detail=error_detail("filter_error", str(error)))
    except InvalidPair as error:
        raise HTTPException(status_code=404, detail=error_detail("invalid_pair", str(error)))
    spec_id = cache.create(stream, kind="witnesses", ttl_seconds=settings.cache_ttl_s) if model is not None else None
    backend.log_to_db(request.p, json.dumps({"tool": "SMTSemDiff-Witness", "mode": request.mode, "specId": spec_id}))
    return {
        "specId": spec_id,
        "mode": request.mode,
        "pair": request.pair,
        "query_a": query_to_dict(stream.query_a),
        "query_b": query_to_dict(stream.query_b),
        "status": stream.status,
        "reason_unknown": stream.reason_unknown,
        "witness": witness_to_dict(stream, model),
    }


@app.get("/witnesses/{spec_id}/next")
def next_witness(spec_id: str, p: str | None = None):
    """Return the next model; ``status`` is ``exhausted`` (or ``incomplete`` after a solver ``unknown``) at the end."""

    entry = cache.get(spec_id)
    if entry is None or entry.kind != "witnesses":
        raise HTTPException(status_code=404, detail=error_detail("not_found", f"Cache not found or expired: {spec_id}"))
    stream: WitnessStream = entry.value
    with entry.lock:
        model = stream.next()
    if model is None:
        cache.delete(spec_id)
        status = "incomplete" if stream.incomplete else "exhausted"
    else:
        status = "sat"
    backend.log_to_db(p, json.dumps({"tool": "SMTSemDiff-Next", "specId": spec_id}))
    return {"specId": spec_id, "status": status, "reason_unknown": stream.reason_unknown, "witness": witness_to_dict(stream, model)}


_EXPLAIN_ERROR_STATUS = {"invalid_mode": 400, "filter_error": 400, "invalid_pair": 404, "witness_not_found": 404}


@app.post("/explain")
def explain(request: ExplainRequest):
    """Explain one witness of a difference region: violated assertions, abductive explanations, counterfactual.

    The witness is identified by its position in the enumeration with the same
    scripts, ``pair`` and ``filter``.
    """

    previous, current = resolve_scripts(request)
    solver_timeout_ms = settings.solver_timeout(request.solver_timeout_ms)
    timeout_s = settings.request_timeout(request.timeout_s)
    try:
        result = run_with_timeout(
            workers.explain_witness, timeout_s,
            previous=previous, current=current, mode=request.mode, pair=request.pair, matching=request.matching,
            filter=request.filter, witness=request.witness, solver_timeout_ms=solver_timeout_ms,
        )
    except ScriptFailure as error:
        raise HTTPException(status_code=400, detail=script_error_detail(str(error), error.version))
    except AnalysisTimeout as error:
        backend.log_to_db(request.p, json.dumps({"tool": "SMTSemDiff-Explain", "mode": request.mode, "error": "timeout"}))
        raise HTTPException(status_code=504, detail=error_detail("timeout", str(error)))
    except AnalysisError as error:
        raise HTTPException(status_code=500, detail=error_detail("internal_error", f"Error explaining witness: {error}"))
    if "error" in result:
        raise HTTPException(status_code=_EXPLAIN_ERROR_STATUS.get(result["error"]["code"], 400), detail=result["error"])
    backend.log_to_db(request.p, json.dumps({"tool": "SMTSemDiff-Explain", "mode": request.mode, "witness": request.witness}))
    result["limits"] = {"solver_timeout_ms": solver_timeout_ms, "timeout_s": timeout_s}
    return result


# ---------------- Legacy endpoints (each script reduced to its last query) ----------------

_ERROR_STATUS = {"parse_error": 400, "filter_error": 400, "invalid_analysis": 400, "invalid_pair": 400, "internal_error": 500}


def _semantic_relation(previous: str, current: str, p: str, format: OutputFormat, solver_timeout_ms: int | None, timeout_s: int | None):
    limit = settings.request_timeout(timeout_s)
    try:
        relation = Relation(run_with_timeout(
            workers.semantic_relation, limit,
            previous=previous, current=current, solver_timeout_ms=settings.solver_timeout(solver_timeout_ms),
        ))
    except AnalysisTimeout:
        detail = error_detail("timeout", f"Semantic relation computation timed out after {limit} seconds")
    except ScriptFailure as error:
        detail = script_error_detail(str(error), error.version)
    except AnalysisError as error:
        detail = error_detail("internal_error", str(error))
    else:
        detail = None
    backend.log_to_db(p, json.dumps({"tool": "SMTSemDiff-Run", "analysis": "semantic-relation"}))
    if format == "json":
        if detail is not None:
            raise HTTPException(status_code={"timeout": 504, "parse_error": 400}.get(detail["code"], 500), detail=detail)
        message = "The solver could not decide the relation (possibly timed out)." if relation is Relation.UNKNOWN else legacy.RELATION_MESSAGES[relation]
        return {"analysis": "semantic-relation", "relation": relation.value, "message": message}
    if detail is not None:
        prefix = "" if detail["code"] == "timeout" else "Error computing semantic relation: "
        return SmtDiffResponse(specId="semantic-relation", witness=legacy.prettify_error(prefix + detail["message"]))
    return SmtDiffResponse(specId="semantic-relation", witness=legacy.RELATION_MESSAGES[relation])


@app.get("/run/", response_model=None)
def run_smt_diff(
    check: str,
    p: str,
    analysis: str,
    filter: str = "",
    format: OutputFormat = "html",
    solver_timeout_ms: int | None = None,
    timeout_s: int | None = None,
):
    """Start an analysis of the permalink's scripts.

    ``format=html`` (default) returns ``{specId, witness}`` with an HTML witness or message;
    ``format=json`` returns the ``/witnesses`` shape and structured errors.
    """

    try:
        previous_spec, current_spec = backend.fetch_scripts(check, p)
        if analysis == "semantic-relation":
            return _semantic_relation(previous_spec, current_spec, p, format, solver_timeout_ms, timeout_s)
        if analysis not in legacy.ANALYSIS_MODES:
            message = f"Invalid mode: {analysis}. Supported modes: {', '.join([*legacy.ANALYSIS_MODES, 'semantic-relation'])}"
            raise HTTPException(status_code=400, detail=error_detail("invalid_analysis", message) if format == "json" else message)
        specId = legacy.store_witness(previous_spec, current_spec, analysis=analysis, filter=filter, solver_timeout_ms=solver_timeout_ms)
        step = legacy.next_step(specId)
        if step is None:
            raise HTTPException(status_code=500, detail="Witness cache entry vanished")
        backend.log_to_db(p, json.dumps({"tool": "SMTSemDiff-Run", "analysis": analysis, "specId": specId, "status": step.status}))
        if format == "json":
            if step.error is not None:
                raise HTTPException(status_code=_ERROR_STATUS.get(step.error.code, 500), detail=step.error.to_dict())
            return {"analysis": analysis, **legacy.render_json(specId, step)}
        return SmtDiffResponse(specId=specId, witness=legacy.render_html(step))
    except HTTPException:
        raise
    except Exception as e:
        backend.log_to_db(p, json.dumps({"tool": "SMTSemDiff-Run", "analysis": analysis, "error": str(e)}))
        message = f"Error starting enumeration: {str(e)}"
        raise HTTPException(status_code=500, detail=error_detail("internal_error", message) if format == "json" else message)


@app.get("/next/{specId}", response_model=None)
def get_next_witness(specId: str, p: str, format: OutputFormat = "html"):
    """Return the next witness of a /run enumeration.

    With ``format=json`` the end of the enumeration is ``status: exhausted``
    (or ``incomplete``) with HTTP 200; with ``format=html`` it is a 404.
    """

    step = legacy.next_step(specId)
    if step is None:
        message = f"Cache not found or expired: {specId}"
        raise HTTPException(status_code=404, detail=error_detail("not_found", message) if format == "json" else message)
    backend.log_to_db(p, json.dumps({"tool": "SMTSemDiff-Next", "specId": specId}))
    if format == "json":
        if step.error is not None:
            raise HTTPException(status_code=_ERROR_STATUS.get(step.error.code, 500), detail=step.error.to_dict())
        return legacy.render_json(specId, step)
    witness = legacy.render_html(step)
    if witness is None:
        raise HTTPException(status_code=404, detail="No more witnesses or cache exhausted")
    return SmtDiffResponse(specId=specId, witness=witness)
