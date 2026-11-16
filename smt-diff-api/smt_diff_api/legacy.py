"""The ``/run`` and ``/next`` endpoints, reducing each script to its last query.

A step of the enumeration is computed once (:func:`next_step`) and rendered
in one of two formats:

* ``html`` (what the current frontend expects): the model in SMT-LIB with
  symbols that only the previous script uses in red and those only the current
  one uses in green, preceded by the logic; errors are HTML messages;
* ``json``: the witness shape of ``/witnesses``, with structured errors.

Errors found while preparing an enumeration are cached and reported once.
"""

from dataclasses import dataclass

from smt_diff import Relation, ScriptError
from z3 import ModelRef

from .cache import cache
from .config import settings
from .serialize import DEFINE_FUN, SIDES, form_end, witness_to_dict
from .witnesses import FilterError, InvalidPair, WitnessStream, open_stream

ANALYSIS_MODES: dict[str, str] = {
    "not-current-but-previous": "tightening",
    "not-previous-but-current": "relaxation",
    "common-witness": "common",
}

def prettify_error(message: object) -> str:
    text = str(message).strip().replace("\\n", "<br/>").replace("\n", "<br/>")
    return f"<span style='color: red;'>{text}</span>"


def prettify_warning(message: str) -> str:
    return f"<span style='color: orange;'>{message.strip()}</span>"


def colorize_model(text: str, previous_only: set[str], current_only: set[str]) -> str:
    """Wrap each ``define-fun`` of a model in a span coloured by the symbol's version."""

    parts: list[str] = []
    position = 0
    while (match := DEFINE_FUN.search(text, position)) is not None:
        parts.append(text[position:match.start()])
        end = form_end(text, match.start())
        name = match.group(1).strip("|")
        color = "red" if name in previous_only else "green" if name in current_only else ""
        parts.append(f"<span style='color: {color};'>{text[match.start():end]}</span>")
        position = end
    parts.append(text[position:])
    return "".join(parts)


def logic_header(logic_previous: str | None, logic_current: str | None) -> str:
    if logic_previous is None and logic_current is None:
        return prettify_warning("; No logic specified; using default solver settings.")
    if logic_previous != logic_current:
        return prettify_warning(f"; Different logics specified ({logic_previous} vs {logic_current}).")
    return logic_previous


RELATION_MESSAGES: dict[Relation, str] = {
    Relation.EQUIVALENT: "Current ≡ Previous\nAll models that satisfy the current script also satisfy the previous script, and vice versa.",
    Relation.INCOMPARABLE: "Scripts are incomparable\nThere exist models that satisfy the current script but not the previous script, and vice versa.",
    Relation.TIGHTENED: "Current ⊨ Previous \nAll models that satisfy the current script also satisfy the previous script. Some models that satisfy the previous script do not satisfy the current script.",
    Relation.RELAXED: "Previous ⊨ Current\nAll models that satisfy the previous script also satisfy the current script. Some models that satisfy the current script do not satisfy the previous script.",
    Relation.UNKNOWN: "unknown",
}


@dataclass(frozen=True)
class LegacyError:
    """A structured error; ``code`` is parse_error, filter_error, invalid_analysis, invalid_pair or internal_error."""

    code: str
    message: str
    script: str | None = None

    def to_dict(self) -> dict:
        return {"code": self.code, "message": self.message, "script": self.script}

    def to_html(self) -> str:
        if self.code == "parse_error":
            side = f"{self.script} script" if self.script else "scripts"
            return prettify_error(f"Error parsing {side}:<br/>{self.message}")
        if self.code == "filter_error":
            return prettify_error(f"Error parsing filter: {self.message}")
        if self.code == "internal_error":
            return prettify_error(f"Error computing witness: {self.message}")
        return prettify_error(self.message)


@dataclass(frozen=True)
class Step:
    """One step of an enumeration.

    ``status`` is ``sat`` (``model`` is the witness), ``unsat`` or ``unknown``
    when the region has no (decided) witness at all, ``exhausted`` or
    ``incomplete`` (a solver call gave up) after the last witness, or
    ``error``.
    """

    status: str
    stream: WitnessStream | None = None
    model: ModelRef | None = None
    error: LegacyError | None = None

    @property
    def reason_unknown(self) -> str:
        return self.stream.reason_unknown if self.stream is not None else ""


def script_error(error: ScriptError) -> LegacyError:
    message = str(error).removeprefix(f"version {error.version}: ")
    return LegacyError("parse_error", message, SIDES.get(error.version or ""))


def store_witness(previous: str, current: str, analysis: str, filter: str = "", solver_timeout_ms: int | None = None) -> str:
    """Cache the witness enumeration of the last queries (or the error preparing it) and return its spec id."""

    value: WitnessStream | LegacyError
    if analysis not in ANALYSIS_MODES:
        value = LegacyError("invalid_analysis", f"Unknown analysis type: {analysis}")
    else:
        try:
            value = open_stream(
                previous, current, ANALYSIS_MODES[analysis], filter=filter,
                solver_timeout_ms=settings.solver_timeout(solver_timeout_ms),
            )
        except ScriptError as error:
            value = script_error(error)
        except FilterError as error:
            value = LegacyError("filter_error", str(error))
        except InvalidPair as error:
            value = LegacyError("invalid_pair", str(error))
        except Exception as error:
            value = LegacyError("internal_error", str(error))
    return cache.create(value, kind="legacy", ttl_seconds=settings.cache_ttl_s)


def next_step(spec_id: str) -> Step | None:
    """Advance the enumeration; None when the spec id is unknown or expired."""

    entry = cache.get(spec_id)
    if entry is None:
        return None
    with entry.lock:
        stream = entry.value
        if isinstance(stream, LegacyError):
            cache.delete(spec_id)
            return Step("error", error=stream)
        try:
            model = stream.next()
        except Exception as error:
            cache.delete(spec_id)
            return Step("error", stream, error=LegacyError("internal_error", str(error)))
    if model is None:
        cache.delete(spec_id)
        if stream.count:
            return Step("incomplete" if stream.incomplete else "exhausted", stream)
        return Step(stream.status, stream)
    return Step("sat", stream, model)


def render_html(step: Step) -> str | None:
    """Return the witness or message shown by the current frontend; None after the last witness."""

    if step.error is not None:
        return step.error.to_html()
    if step.status in ("exhausted", "incomplete"):
        return None
    if step.status == "unsat":
        return "No diff witnesses found (unsat/unknown)."
    if step.status == "unknown":
        reason = f" ({step.reason_unknown})" if step.reason_unknown else ""
        return prettify_error(f"Solver returned unknown (possibly timed out){reason}")
    stream = step.stream
    text = colorize_model(step.model.sexpr(), stream.previous_only, stream.current_only)
    return logic_header(stream.logic_a, stream.logic_b) + "\n" + text


def render_json(spec_id: str, step: Step) -> dict:
    """Return the step in the ``/witnesses`` shape; ``specId`` is None once nothing more can follow."""

    stream = step.stream
    return {
        "specId": spec_id if step.status == "sat" else None,
        "status": step.status,
        "reason_unknown": step.reason_unknown,
        "witness": witness_to_dict(stream, step.model) if stream is not None else None,
        "logic": {"previous": stream.logic_a, "current": stream.logic_b} if stream is not None else None,
        "error": step.error.to_dict() if step.error is not None else None,
    }


def get_next_witness(spec_id: str) -> str | None:
    """Return the next witness in HTML, a one-shot message, or None when there is nothing more."""

    step = next_step(spec_id)
    return render_html(step) if step is not None else None
