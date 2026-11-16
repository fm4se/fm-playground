"""Translate queries into Z3 formulas over a common, conflict-free signature.

Two queries can only be compared once their symbols are placed in one
vocabulary.  Z3 identifies uninterpreted symbols by name *and* sort, but it
identifies datatype sorts by name only and keeps recursive definitions in
global context state.  Naively parsing two versions into one context is
therefore unsound when a datatype or a recursive function changes between
versions.  This module builds the union signature explicitly:

* a symbol declared identically in both queries (same identity and,
  recursively, same meaning of every symbol the identity mentions) is
  *shared*; version B's copy of the declaration is dropped.  The identity is
  the declaration up to notation: ``declare-const`` vs ``declare-fun`` with
  no arguments, expanded sort aliases, default sort arity, ``declare-datatype``
  vs ``declare-datatypes`` and renamed datatype parameters do not matter;
* every other symbol of version B that clashes with a symbol of version A is
  *renamed apart* with a fresh name.  Renaming is uniform over B's commands,
  so B's meaning is preserved up to the symbol isomorphism;
* definitions (``define-fun``, ``:named``) are abbreviations that Z3 expands
  while parsing, and recursive definitions are interpretations, so renaming
  them is semantically invisible.

Each pair is parsed into its own :class:`z3.Context`, which isolates the
global state Z3 keeps per context.
"""

import re
from dataclasses import dataclass, field, replace
from typing import Callable, cast

from z3 import And, AstVector, BoolRef, BoolVal, Context, Implies, Int, IsInt, Real, ToInt, Z3Exception, parse_smt2_string, substitute

from .sexpr import SExpr, canonical, render, symbol_text, symbols_in
from .smt_parser import Declaration, Query, ScopedItem, ScriptError

SORT_CATEGORIES: frozenset[str] = frozenset({"sort", "sort-alias", "datatype"})
DEFINITION_CATEGORIES: frozenset[str] = frozenset({"definition", "named", "recursive"})
# Collisions between two of these only rename abbreviations or interpreted symbols apart.
ABBREVIATION_CATEGORIES: frozenset[str] = DEFINITION_CATEGORIES | {"sort-alias"}
NUMERIC_SORTS: frozenset[str] = frozenset({"Int", "Real"})
ERROR_LINE = re.compile(r"line (\d+) column (\d+): (.*)")


@dataclass(frozen=True)
class CollisionDiagnostic:
    """Describe a symbol that both versions introduce with different meanings.

    ``resolution`` states how the symbol is compared: ``renamed`` (B's symbol
    is renamed apart, so the versions talk about different symbols),
    ``widened`` (an ``Int`` constant is compared with a ``Real`` constant
    through the embedding of the integers into the reals) or ``defined`` (a
    symbol declared in one version is compared with its definition in the
    other).  ``changes_vocabulary`` is False when the collision does not change
    the symbols the two versions are compared over, e.g. for two different
    definitions, which are only abbreviations.
    """

    symbol: str
    message: str
    left_signature: str
    right_signature: str
    renamed_to: str | None = None
    resolution: str = "renamed"
    changes_vocabulary: bool = True


@dataclass(frozen=True)
class Widening:
    """A constant declared ``Int`` in one version and ``Real`` in the other.

    The versions share one ``Real`` constant named ``name``.  The ``Int``
    version reads it through ``to_int`` and requires it to be an integer, so its
    models are exactly the images of its own models under ``to_real``.
    """

    name: str
    name_b: str
    int_side: str
    declaration: Declaration


@dataclass(frozen=True)
class DefinitionLink:
    """A symbol declared in one version and defined in the other.

    The declared symbol ``name`` is shared.  The definition is renamed apart to
    ``defined_as`` (which is invisible, because definitions are expanded), and
    the defining version gets the defining equation ``name = defined_as`` (for
    functions: ``forall args. name(args) = defined_as(args)``).  This is a
    definitional extension, so it does not change the models of that version.
    """

    name: str
    defined_as: str
    defining_side: str
    declaration: Declaration
    text: str


@dataclass(frozen=True)
class AssertionEntry:
    """One conjunct of a query: an assertion or a check-sat-assuming literal."""

    ast: BoolRef
    text: str
    command_index: int | None
    line: int | None
    level: int
    kind: str = "assertion"


@dataclass(frozen=True)
class EncodedQuery:
    """A query translated into Z3, with one entry per conjunct."""

    query: Query
    entries: tuple[AssertionEntry, ...]
    formula: BoolRef

    @property
    def asts(self) -> tuple[BoolRef, ...]:
        """Return the Z3 terms of all conjuncts."""

        return tuple(entry.ast for entry in self.entries)


@dataclass(frozen=True)
class PairPlan:
    """Describe how the signatures of two queries are merged."""

    query_a: Query
    query_b: Query
    omitted_b: frozenset[int]
    renaming_b: dict[str, str]
    collisions: tuple[CollisionDiagnostic, ...]
    shared: frozenset[str]
    private_a: tuple[str, ...]
    private_b: tuple[str, ...]
    validate_b: bool
    renaming_a: dict[str, str] = field(default_factory=dict)
    widenings: tuple[Widening, ...] = ()
    links: tuple[DefinitionLink, ...] = ()

    @property
    def signature_changed(self) -> bool:
        """Return True when some symbol is compared as two different symbols."""

        return any(collision.changes_vocabulary for collision in self.collisions)


def _declaration_map(query: Query) -> dict[tuple[str, str], Declaration]:
    """Map ``(namespace, name)`` of each active symbol of a query to its declaration."""

    result: dict[tuple[str, str], Declaration] = {}
    declaration: Declaration
    for declaration in query.declarations:
        name: str
        for name in declaration.sort_names:
            result[("sort", name)] = declaration
        for name in declaration.function_names:
            result[("function", name)] = declaration
    return result


def _keys(declaration: Declaration) -> list[tuple[str, str]]:
    """Return the namespace keys a declaration introduces."""

    return [("sort", name) for name in declaration.sort_names] + [("function", name) for name in declaration.function_names]


def _identity(declaration: Declaration, key: tuple[str, str]) -> tuple[str, frozenset[str], frozenset[tuple[str, str]]]:
    """Return the identity of the entity that ``key`` names, its references and the keys it introduces.

    A datatype command is split into its datatypes: each datatype is
    identified on its own and independently of constructor order, so
    reordering constructors or datatypes, or regrouping datatypes into
    commands, keeps the symbols shared.  Any other declaration is identified
    as a whole.
    """

    member = declaration.member(*key)
    if member is None:
        return declaration.identity, declaration.identity_references, frozenset(_keys(declaration))
    group: frozenset[tuple[str, str]] = frozenset(
        (other.namespace, other.name) for other in declaration.members if other.datatype == member.datatype
    )
    return member.identity, member.references, group


def _used_symbols(query: Query) -> frozenset[str]:
    """Return every symbol mentioned by the commands and assumptions of a query."""

    used: set[str] = set()
    item: ScopedItem
    for item in query.items:
        used |= symbols_in(item.command.sexpr)
    assumption: SExpr
    for assumption in query.assumptions:
        used |= symbols_in(assumption)
    return frozenset(used)


def _asserted_symbols(query: Query) -> frozenset[str]:
    """Return the symbols mentioned by the assertions and assumptions of a query."""

    used: set[str] = set()
    for item in query.assertions:
        used |= symbols_in(item.command.sexpr)
    for assumption in query.assumptions:
        used |= symbols_in(assumption)
    return frozenset(used)


def _collision_message(left: Declaration, right: Declaration, key: tuple[str, str] | None = None) -> str:
    """Classify why two declarations of the same symbol differ."""

    if key is not None and left.member(*key) is not None and right.member(*key) is not None:
        if _identity(left, key)[0] == _identity(right, key)[0]:
            return "datatype is unchanged, but it is declared with or depends on a datatype that differs"
        return "sort definition differs"
    if left.identity == right.identity:
        return "declaration depends on symbols that differ between the versions"
    if left.canonical == right.canonical:
        return "same text, but a sort alias it uses differs between the versions"
    if left.category == "function" and right.category == "function":
        return "arity mismatch" if left.arity != right.arity else "sort mismatch"
    if left.category in SORT_CATEGORIES and right.category in SORT_CATEGORIES:
        return "sort definition differs"
    if (left.category in DEFINITION_CATEGORIES) != (right.category in DEFINITION_CATEGORIES):
        return "declared in one version and defined in the other"
    if left.category in DEFINITION_CATEGORIES:
        return "definition differs"
    return "kind of symbol differs"


def _fresh(name: str, reserved: set[str], suffix: str = "@B") -> str:
    """Return a new symbol name derived from ``name`` that is not reserved."""

    candidate: str = f"{name}{suffix}"
    counter: int = 2
    while candidate in reserved:
        candidate = f"{name}{suffix}{counter}"
        counter += 1
    reserved.add(candidate)
    return candidate


def _bridge(left: Declaration, right: Declaration, same_sort: "Callable[[str], bool]", renamed_names: set[str]) -> str | None:
    """Return how two different declarations of one function symbol can be compared directly.

    ``widened``: both declare a constant, one of sort ``Int`` and one of sort
    ``Real``.  ``defined-in-A`` / ``defined-in-B``: one version declares the
    symbol and the other defines it (``define-fun``/``define-const``) with the
    same argument and result sorts.  ``None``: there is no canonical mapping,
    and the symbols are renamed apart.
    """

    if len(left.function_names) != 1 or len(right.function_names) != 1 or left.sort_names or right.sort_names:
        return None
    if left.signature is None or right.signature is None:
        return None
    domain_a, range_a = left.signature
    domain_b, range_b = right.signature
    if left.category == "function" and right.category == "function":
        if not domain_a and not domain_b and {canonical(range_a), canonical(range_b)} == NUMERIC_SORTS:
            return "widened"
        return None
    if {left.category, right.category} != {"function", "definition"}:
        return None
    if [canonical(sort) for sort in domain_a] != [canonical(sort) for sort in domain_b] or canonical(range_a) != canonical(range_b):
        return None
    sorts: set[str] = set()
    sort: SExpr
    for sort in (*domain_a, range_a):
        sorts |= symbols_in(sort)
    # The equation is stated over A's sorts, so every sort it mentions must mean the same in B.
    if sorts & renamed_names or not all(same_sort(name) for name in sorts):
        return None
    return "defined-in-A" if left.category == "definition" else "defined-in-B"


def _link(name: str, defined_as: str, side: str, definition: Declaration, reserved: set[str]) -> DefinitionLink:
    """Return the defining equation that relates a declared symbol to its definition."""

    assert definition.signature is not None
    domain: tuple[SExpr, ...] = definition.signature[0]
    if not domain:
        text: str = f"(assert (= {symbol_text(name)} {symbol_text(defined_as)}))"
    else:
        variables: list[str] = [symbol_text(_fresh(f"{name}@arg{index}", reserved, "")) for index in range(1, len(domain) + 1)]
        binders: str = " ".join(f"({variable} {render(sort)})" for variable, sort in zip(variables, domain))
        arguments: str = " ".join(variables)
        text = f"(assert (forall ({binders}) (= ({symbol_text(name)} {arguments}) ({symbol_text(defined_as)} {arguments}))))"
    return DefinitionLink(name, defined_as, side, definition, text)


def plan_pair(query_a: Query, query_b: Query, reserved_names: frozenset[str], translate: bool = True) -> PairPlan:
    """Decide which symbols the two queries share and which are renamed apart.

    With ``translate=False`` the two translations (the Int-Real embedding and
    the extension by definition) are disabled: such symbols are renamed apart
    like any other clashing symbol.
    """

    decls_a: dict[tuple[str, str], Declaration] = _declaration_map(query_a)
    decls_b: dict[tuple[str, str], Declaration] = _declaration_map(query_b)
    memo: dict[tuple[str, str], bool] = {}

    def same_key(key: tuple[str, str], visiting: frozenset[tuple[str, str]]) -> bool:
        """Return True when the symbol ``key`` denotes the same entity in both queries."""

        left: Declaration | None = decls_a.get(key)
        right: Declaration | None = decls_b.get(key)
        if left is None and right is None:
            return True
        if left is None or right is None:
            return False
        identity_a, references_a, group = _identity(left, key)
        identity_b, references_b, _ = _identity(right, key)
        if identity_a != identity_b:
            return False
        if key in memo:
            return memo[key]
        if key in visiting:
            return True
        inner: frozenset[tuple[str, str]] = visiting | group
        result: bool = all(same_name(reference, inner) for reference in references_a | references_b)
        for defined in group:
            memo[defined] = result
        return result

    def same_name(name: str, visiting: frozenset[tuple[str, str]]) -> bool:
        """Return True when a referenced name means the same in both namespaces."""

        return same_key(("sort", name), visiting) and same_key(("function", name), visiting)

    unique_b: list[Declaration] = []
    seen: set[int] = set()
    declaration: Declaration
    for declaration in query_b.declarations:
        if id(declaration) not in seen:
            seen.add(id(declaration))
            unique_b.append(declaration)
    clashing: dict[int, list[tuple[str, str]]] = {
        id(declaration): [key for key in _keys(declaration) if key in decls_a] for declaration in unique_b
    }
    shareable: list[Declaration] = []
    renamed: list[Declaration] = []
    for declaration in unique_b:
        keys: list[tuple[str, str]] = clashing[id(declaration)]
        if not keys:
            continue
        if declaration.category != "named" and all(same_key(key, frozenset()) for key in _keys(declaration)):
            shareable.append(declaration)
        else:
            renamed.append(declaration)
    # Renaming is uniform over B's text, so a shared declaration that mentions
    # a renamed name (in any namespace) can no longer be shared.  Its own text
    # is omitted from B, so what matters are its names and the symbols its
    # identity depends on (a sort alias it was written with is expanded).
    changed: bool = True
    while changed:
        changed = False
        renamed_names: set[str] = {name for item in renamed for name in item.names}
        for declaration in list(shareable):
            if (set(declaration.names) | declaration.identity_references) & renamed_names:
                shareable.remove(declaration)
                renamed.append(declaration)
                changed = True
    all_renamed: set[str] = {name for item in renamed for name in item.names}
    reserved: set[str] = set(reserved_names)
    renaming: dict[str, str] = {}
    renaming_a: dict[str, str] = {}
    collisions: list[CollisionDiagnostic] = []
    widenings: list[Widening] = []
    links: list[DefinitionLink] = []
    for declaration in renamed:
        keys: list[tuple[str, str]] = clashing[id(declaration)]
        bridge: str | None = None
        if translate and keys and declaration.category != "named":
            bridge = _bridge(
                decls_a[keys[0]], declaration, lambda sort: same_key(("sort", sort), frozenset()), all_renamed,
            )
        if bridge == "defined-in-A":
            # B's declaration stays; A's definition is renamed apart, which is invisible.
            definition: Declaration = decls_a[keys[0]]
            symbol: str = keys[0][1]
            renaming_a[symbol] = _fresh(symbol, reserved, "@A")
            links.append(_link(symbol, renaming_a[symbol], "A", definition, reserved))
            collisions.append(CollisionDiagnostic(
                symbol, "declared in one version and defined in the other; compared through the definition",
                definition.canonical, declaration.canonical, None, "defined", False,
            ))
            continue
        name: str
        for name in declaration.names:
            if name not in renaming:
                renaming[name] = _fresh(name, reserved)
        if declaration.category == "datatype":
            for name in declaration.function_names:
                renaming.setdefault(f"is-{name}", f"is-{renaming[name]}")
        if not keys or (declaration.category == "named" and same_key(keys[0], frozenset())):
            continue
        # Report the first symbol that differs itself (in a datatype block, others may be unchanged).
        report: tuple[str, str] = next((key for key in keys if not same_key(key, frozenset())), keys[0])
        left: Declaration = decls_a[report]
        symbol = report[1]
        if bridge == "widened":
            int_side: str = "A" if left.signature is not None and canonical(left.signature[1]) == "Int" else "B"
            widenings.append(Widening(symbol, renaming[symbol], int_side, left if int_side == "A" else declaration))
            collisions.append(CollisionDiagnostic(
                symbol, "sort changed between Int and Real; compared through the embedding of Int into Real",
                left.canonical, declaration.canonical, None, "widened", False,
            ))
        elif bridge == "defined-in-B":
            links.append(_link(symbol, renaming[symbol], "B", declaration, reserved))
            collisions.append(CollisionDiagnostic(
                symbol, "declared in one version and defined in the other; compared through the definition",
                left.canonical, declaration.canonical, None, "defined", False,
            ))
        else:
            abbreviation: bool = left.category in ABBREVIATION_CATEGORIES and declaration.category in ABBREVIATION_CATEGORIES
            collisions.append(CollisionDiagnostic(
                symbol, _collision_message(left, declaration, report), left.canonical, declaration.canonical, renaming[symbol],
                "renamed", not abbreviation,
            ))
    omitted: frozenset[int] = frozenset(declaration.command.index for declaration in shareable)
    shared: frozenset[str] = frozenset(name for declaration in shareable for name in declaration.names)
    names_a: set[str] = {key[1] for key in decls_a}
    names_b: set[str] = {key[1] for key in decls_b}
    functions_a: set[str] = {key[1] for key, value in decls_a.items() if value.category == "function"}
    functions_b: set[str] = {key[1] for key, value in decls_b.items() if value.category == "function"}
    private_a: tuple[str, ...] = tuple(sorted((functions_a - names_b) & _asserted_symbols(query_a)))
    private_b: tuple[str, ...] = tuple(sorted((functions_b - names_a) & _asserted_symbols(query_b)))
    validate_b: bool = bool(_used_symbols(query_b) & (names_a - names_b))
    return PairPlan(
        query_a, query_b, omitted, renaming, tuple(collisions), shared, private_a, private_b, validate_b,
        renaming_a, tuple(widenings), tuple(links),
    )


def conjunction(asts: tuple[BoolRef, ...], ctx: Context) -> BoolRef:
    """Return the conjunction of ``asts`` in ``ctx`` (``true`` when empty)."""

    if not asts:
        return BoolVal(True, ctx)
    if len(asts) == 1:
        return asts[0]
    return cast(BoolRef, And(list(asts)))


def _lines(query: Query, side: str, renaming: dict[str, str], omitted: frozenset[int]) -> list[tuple[str, str, ScopedItem | None, SExpr | None]]:
    """Return ``(text, side, item, assumption)`` for each command sent to Z3."""

    lines: list[tuple[str, str, ScopedItem | None, SExpr | None]] = []
    item: ScopedItem
    for item in query.items:
        if item.kind == "declaration" and item.command.index in omitted:
            continue
        lines.append((render(item.command.sexpr, renaming), side, item, None))
    assumption: SExpr
    for assumption in query.assumptions:
        lines.append((f"(assert {render(assumption, renaming)})", side, None, assumption))
    return lines


def _parse(lines: list[tuple[str, str, ScopedItem | None, SExpr | None]], ctx: Context) -> AstVector:
    """Parse the given commands, attributing Z3 errors to the originating command."""

    try:
        return parse_smt2_string("\n".join(line[0] for line in lines), ctx=ctx)
    except Z3Exception as error:
        detail: str = error.value.decode() if isinstance(error.value, bytes) else str(error.value)
        match: re.Match[str] | None = ERROR_LINE.search(detail)
        # A rendered command spans several lines when it contains a multi-line string literal.
        owners: list[int] = [index for index, line in enumerate(lines) for _ in range(line[0].count("\n") + 1)]
        if match is not None and 1 <= int(match.group(1)) <= len(owners):
            _, side, item, _ = lines[owners[int(match.group(1)) - 1]]
            message: str = match.group(3).rstrip('")\n ')
            command = item.command if item is not None else None
            raise ScriptError(f"Z3 rejected the script: {message}", command, side) from error
        raise ScriptError(f"Z3 rejected the script: {detail.strip()}") from error


def _entries(query: Query, vector: AstVector, offset: int) -> tuple[AssertionEntry, ...]:
    """Pair the parsed terms starting at ``offset`` with the conjuncts of ``query``."""

    entries: list[AssertionEntry] = []
    position: int = offset
    item: ScopedItem
    for item in query.assertions:
        entries.append(AssertionEntry(cast(BoolRef, vector[position]), item.command.text, item.command.index, item.command.line, item.level))
        position += 1
    assumption: SExpr
    for assumption in query.assumptions:
        command_index: int | None = query.command.index if query.command is not None else None
        entries.append(AssertionEntry(cast(BoolRef, vector[position]), render(assumption), command_index, query.line, query.depth, "assumption"))
        position += 1
    return tuple(entries)


def _expected(query: Query) -> int:
    """Return the number of terms Z3 must return for ``query``."""

    return len(query.assertions) + len(query.assumptions)


def encode_query(query: Query, ctx: Context, side: str = "A") -> EncodedQuery:
    """Translate a single query into ``ctx``."""

    lines = _lines(query, side, {}, frozenset())
    vector: AstVector = _parse(lines, ctx)
    if len(vector) != _expected(query):
        raise RuntimeError(f"internal error: Z3 returned {len(vector)} terms for {_expected(query)} conjuncts")
    entries: tuple[AssertionEntry, ...] = _entries(query, vector, 0)
    return EncodedQuery(query, entries, conjunction(tuple(entry.ast for entry in entries), ctx))


def encode_pair(plan: PairPlan, ctx: Context) -> tuple[EncodedQuery, EncodedQuery]:
    """Translate both queries of a pair into ``ctx`` over their merged signature."""

    if plan.validate_b:
        # B's text is parsed after A's; make sure B does not silently rely on
        # a symbol that only A declares.
        _parse(_lines(plan.query_b, "B", {}, frozenset()), Context())
    lines_a = _lines(plan.query_a, "A", plan.renaming_a, frozenset())
    lines_b = _lines(plan.query_b, "B", plan.renaming_b, plan.omitted_b)
    # Defining equations are parsed last: they mention symbols of both versions.
    queries: dict[str, Query] = {"A": plan.query_a, "B": plan.query_b}
    lines_links: list[tuple[str, str, ScopedItem | None, SExpr | None]] = [
        (link.text, link.defining_side, _item_of(queries[link.defining_side], link.declaration), None) for link in plan.links
    ]
    vector: AstVector = _parse(lines_a + lines_b + lines_links, ctx)
    expected: int = _expected(plan.query_a) + _expected(plan.query_b) + len(plan.links)
    if len(vector) != expected:
        raise RuntimeError(f"internal error: Z3 returned {len(vector)} terms for {expected} conjuncts")
    entries: dict[str, list[AssertionEntry]] = {
        "A": list(_entries(plan.query_a, vector, 0)),
        "B": list(_entries(plan.query_b, vector, _expected(plan.query_a))),
    }
    position: int = _expected(plan.query_a) + _expected(plan.query_b)
    link: DefinitionLink
    for link in plan.links:
        entries[link.defining_side].append(_declaration_entry(
            cast(BoolRef, vector[position]), queries[link.defining_side], link.declaration, "definition",
        ))
        position += 1
    widening: Widening
    for widening in plan.widenings:
        shared = Real(widening.name, ctx)
        if widening.int_side == "A":
            substitutions = {"A": (Int(widening.name, ctx), ToInt(shared)), "B": (Real(widening.name_b, ctx), shared)}
        else:
            substitutions = {"B": (Int(widening.name_b, ctx), ToInt(shared))}
        integral: BoolRef = cast(BoolRef, IsInt(shared))
        for side, pair in substitutions.items():
            updated: list[AssertionEntry] = []
            for entry in entries[side]:
                ast: BoolRef = cast(BoolRef, substitute(entry.ast, pair))
                if side == widening.int_side and not ast.eq(entry.ast):
                    # Equivalent under the conjunct is_int(x) below; the guard keeps a
                    # non-integer witness from falsifying conjuncts through to_int.
                    ast = cast(BoolRef, Implies(integral, ast))
                updated.append(replace(entry, ast=ast))
            entries[side] = updated
        entries[widening.int_side].append(_declaration_entry(
            integral, queries[widening.int_side], widening.declaration, "sort",
        ))
    return (
        EncodedQuery(plan.query_a, tuple(entries["A"]), conjunction(tuple(entry.ast for entry in entries["A"]), ctx)),
        EncodedQuery(plan.query_b, tuple(entries["B"]), conjunction(tuple(entry.ast for entry in entries["B"]), ctx)),
    )


def _item_of(query: Query, declaration: Declaration) -> ScopedItem | None:
    """Return the active item of ``query`` that introduced ``declaration``."""

    return next((item for item in query.items if item.declaration is declaration), None)


def _declaration_entry(ast: BoolRef, query: Query, declaration: Declaration, kind: str) -> AssertionEntry:
    """Return a conjunct that a declaration contributes (a sort constraint or a defining equation)."""

    item: ScopedItem | None = _item_of(query, declaration)
    command = declaration.command
    return AssertionEntry(ast, command.text, command.index, command.line, item.level if item is not None else 0, kind)
