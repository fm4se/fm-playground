"""Decide which check-sat query of one script corresponds to which query of the other.

Matching is a presentation decision, not a semantic one: every matched pair
is compared exactly, whichever pairs are chosen.  Two strategies exist:

``positional``
    The i-th query of A is paired with the i-th query of B; surplus queries
    stay unmatched.

``align``
    An order-preserving alignment (Needleman-Wunsch) that first maximises the
    number of pairs and then the summed syntactic similarity of the pairs.
    With equally many queries this is exactly positional matching; when one
    script has more queries, similarity decides which queries count as
    inserted or deleted, like a line-based diff does for text.  Among
    alignments with the same score, the one with the latest gaps is chosen,
    so when the similarities tie the result is the positional matching.
"""

from dataclasses import dataclass
from typing import Sequence

from .sexpr import canonical, symbols_in
from .smt_parser import Query

ASSERTION_WEIGHT: float = 0.75
SYMBOL_WEIGHT: float = 0.25
STRATEGIES: tuple[str, ...] = ("align", "positional")


@dataclass(frozen=True)
class QueryMatch:
    """Pair query positions (0-based); ``None`` marks a query without counterpart."""

    index_a: int | None
    index_b: int | None


def query_features(query: Query) -> tuple[frozenset[str], frozenset[str]]:
    """Return the canonical assertion texts and the declared symbols a query uses."""

    constraints: set[str] = {canonical(item.command.sexpr.items[1]) for item in query.assertions}
    constraints |= {"assume " + canonical(assumption) for assumption in query.assumptions}
    declared: set[str] = {name for declaration in query.declarations for name in declaration.names}
    used: set[str] = set()
    for item in query.assertions:
        used |= symbols_in(item.command.sexpr)
    for assumption in query.assumptions:
        used |= symbols_in(assumption)
    return frozenset(constraints), frozenset(used & declared)


def _jaccard(left: frozenset[str], right: frozenset[str]) -> float:
    """Return the Jaccard similarity, treating two empty sets as identical."""

    if not left and not right:
        return 1.0
    return len(left & right) / len(left | right)


def _similarity(features_a: tuple[frozenset[str], frozenset[str]], features_b: tuple[frozenset[str], frozenset[str]]) -> float:
    """Combine assertion overlap and symbol overlap into one score."""

    return ASSERTION_WEIGHT * _jaccard(features_a[0], features_b[0]) + SYMBOL_WEIGHT * _jaccard(features_a[1], features_b[1])


def query_similarity(query_a: Query, query_b: Query) -> float:
    """Return a syntactic similarity in [0, 1] between two queries."""

    return _similarity(query_features(query_a), query_features(query_b))


def match_queries(queries_a: Sequence[Query], queries_b: Sequence[Query], strategy: str = "align") -> tuple[QueryMatch, ...]:
    """Return an order-preserving matching of the two query sequences."""

    if strategy == "positional":
        common: int = min(len(queries_a), len(queries_b))
        matches: list[QueryMatch] = [QueryMatch(index, index) for index in range(common)]
        matches += [QueryMatch(index, None) for index in range(common, len(queries_a))]
        matches += [QueryMatch(None, index) for index in range(common, len(queries_b))]
        return tuple(matches)
    if strategy != "align":
        raise ValueError(f"unknown matching strategy '{strategy}' (expected one of {', '.join(STRATEGIES)})")
    rows: int = len(queries_a)
    columns: int = len(queries_b)
    # Each pair scores bonus + similarity with similarity in [0, 1]; a bonus
    # larger than the number of possible pairs makes cardinality dominate.
    bonus: float = float(min(rows, columns) + 1)
    features_b: list[tuple[frozenset[str], frozenset[str]]] = [query_features(query) for query in queries_b]
    similarity: list[list[float]] = [
        [_similarity(features_a, other) for other in features_b]
        for features_a in (query_features(query) for query in queries_a)
    ]
    score: list[list[float]] = [[0.0] * (columns + 1) for _ in range(rows + 1)]
    row: int
    column: int
    for row in range(1, rows + 1):
        for column in range(1, columns + 1):
            score[row][column] = max(
                score[row - 1][column - 1] + bonus + similarity[row - 1][column - 1],
                score[row - 1][column],
                score[row][column - 1],
            )
    return _backtrace(score)


def _backtrace(score: list[list[float]]) -> tuple[QueryMatch, ...]:
    """Recover one optimal alignment from the score table.

    The backtrace runs from the end, so taking a gap whenever it keeps the
    score optimal places gaps as late as possible.  When several alignments
    have the same score (e.g. all similarities tie), the result is therefore
    the positional matching: the first queries are paired, the surplus
    queries at the end stay unmatched.  When no gap keeps the score, the
    score was reached by pairing the two current queries.
    """

    reversed_matches: list[QueryMatch] = []
    row: int = len(score) - 1
    column: int = len(score[0]) - 1
    tolerance: float = 1e-9
    while row > 0 or column > 0:
        if row > 0 and (column == 0 or abs(score[row][column] - score[row - 1][column]) < tolerance):
            reversed_matches.append(QueryMatch(row - 1, None))
            row -= 1
        elif column > 0 and (row == 0 or abs(score[row][column] - score[row][column - 1]) < tolerance):
            reversed_matches.append(QueryMatch(None, column - 1))
            column -= 1
        else:
            reversed_matches.append(QueryMatch(row - 1, column - 1))
            row, column = row - 1, column - 1
    return tuple(reversed(reversed_matches))
