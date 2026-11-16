"""Semantic comparison of SMT-LIB scripts.

A script denotes a sequence of satisfiability queries; two scripts are
compared query by query, exactly, in both directions, with witnesses,
abductive explanations and counterfactuals (see ``docs/SEMANTICS.md``).

Typical use::

    from smt_diff import SemanticDiffTool
    from smt_diff.certify import certify

    result = SemanticDiffTool(script_a, script_b).analyze()
    print(result.equivalent, [pair.relation for pair in result.pairs])
    assert certify(result) == []
"""

from importlib.metadata import PackageNotFoundError, version

from .semantic_diff import (
    DiffResult,
    DirectionResult,
    Explanation,
    QueryPairResult,
    Relation,
    SemanticDiffTool,
    UnmatchedQuery,
    ValueChange,
    classify_assertions,
    explain_divergence,
)
from .smt_parser import ScriptError

try:
    __version__: str = version("smt-diff")
except PackageNotFoundError:  # running from a source checkout without installation
    __version__ = "0.0.0+unknown"

__all__ = [
    "DiffResult",
    "DirectionResult",
    "Explanation",
    "QueryPairResult",
    "Relation",
    "ScriptError",
    "SemanticDiffTool",
    "UnmatchedQuery",
    "ValueChange",
    "classify_assertions",
    "explain_divergence",
    "__version__",
]
