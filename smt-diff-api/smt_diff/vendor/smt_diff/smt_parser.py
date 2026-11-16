"""Interpret SMT-LIB scripts as sequences of satisfiability queries.

An SMT-LIB script is not a single formula: it drives a solver whose state is
an *assertion stack*.  ``push``/``pop`` open and close scopes, declarations
and assertions live in the scope in which they were issued, and every
``check-sat``/``check-sat-assuming`` asks one satisfiability question about
the assertions that are active at that moment.  This module executes a script
symbolically (without a solver) following the SMT-LIB 2.6 semantics and
returns one :class:`Query` per check command.  Each query records exactly the
declarations, assertions and assumptions that are in scope, so it can later be
compared with a query of another script without any flattening.
"""

from dataclasses import dataclass, field
from typing import Mapping

from .sexpr import (
    Atom,
    Command,
    SExpr,
    SList,
    SMTLibSyntaxError,
    canonical,
    read_commands,
    render,
    symbol_text,
    symbols_in,
)

SortAliases = Mapping[str, tuple[tuple[str, ...], SExpr]]
NORMAL_KEYWORDS: frozenset[str] = frozenset({"declare-fun", "declare-sort", "declare-datatypes", "par"})

DECLARATION_COMMANDS: frozenset[str] = frozenset({
    "declare-const", "declare-fun", "define-fun", "define-const", "define-fun-rec",
    "define-funs-rec", "declare-sort", "define-sort", "declare-datatype", "declare-datatypes",
})
IGNORED_COMMANDS: frozenset[str] = frozenset({
    "set-info", "get-info", "get-option", "get-model", "get-value", "get-assignment",
    "get-assertions", "get-proof", "get-unsat-core", "get-unsat-assumptions", "echo",
    "simplify", "eval", "display", "get-objectives", "get-difficulty", "get-interpolant",
})
FUNCTION_CATEGORIES: dict[str, str] = {
    "declare-const": "function",
    "declare-fun": "function",
    "define-fun": "definition",
    "define-const": "definition",
    "define-fun-rec": "recursive",
}


class ScriptError(ValueError):
    """Report a script that is ill-formed under the assertion-stack semantics."""

    def __init__(self, message: str, command: Command | None = None, version: str | None = None) -> None:
        prefix: str = f"version {version}: " if version is not None else ""
        location: str = f"command #{command.index} (line {command.line}): " if command is not None else ""
        super().__init__(f"{prefix}{location}{message}")
        self.command: Command | None = command
        self.version: str | None = version


@dataclass(frozen=True)
class DatatypeMember:
    """The identity of one datatype of a datatype command, for one symbol it introduces.

    ``namespace`` and ``name`` identify the symbol (the sort, a constructor or a
    selector); ``datatype`` is the sort it belongs to.  ``identity`` ignores the
    order of constructors and of the datatypes in a block; ``references`` are
    the other sorts the datatype's fields mention.
    """

    namespace: str
    name: str
    datatype: str
    identity: str
    references: frozenset[str]


@dataclass(frozen=True)
class Declaration:
    """Describe the symbols introduced by one declaration, definition, or ``:named`` label.

    ``category`` is one of ``function`` (declare-fun/const), ``definition``
    (define-fun/const), ``recursive`` (define-fun(s)-rec), ``named``
    (``(! t :named n)``), ``sort`` (declare-sort), ``sort-alias``
    (define-sort), ``datatype`` or ``other``.  ``canonical`` identifies the
    declaration up to whitespace and quoting; ``references`` lists the other
    symbols it mentions, which is what makes two textually equal declarations
    mean the same thing.
    """

    command: Command
    names: tuple[str, ...]
    sort_names: tuple[str, ...]
    category: str
    canonical: str
    references: frozenset[str]
    arity: int | None = None
    normal_form: str | None = None
    normal_references: frozenset[str] | None = None
    alias_definition: tuple[tuple[str, ...], SExpr] | None = None
    signature: tuple[tuple[SExpr, ...], SExpr] | None = None
    """Argument sorts and result sort of a declared or defined function, with sort aliases expanded."""
    members: tuple[DatatypeMember, ...] = ()
    """Order-independent identity of each datatype of a datatype command."""

    def member(self, namespace: str, name: str) -> DatatypeMember | None:
        """Return the datatype member that introduces ``name`` in ``namespace``, if any."""

        return next((member for member in self.members if member.namespace == namespace and member.name == name), None)

    @property
    def function_names(self) -> tuple[str, ...]:
        """Return the names this declaration adds to the function namespace."""

        return self.names[len(self.sort_names):]

    @property
    def identity(self) -> str:
        """Return the text that identifies the declared symbols up to notation.

        Equal identities denote the same symbols: ``declare-const`` is written
        as ``declare-fun`` with no arguments, sort aliases are expanded, a
        missing ``declare-sort`` arity is 0, ``declare-datatype`` is written as
        ``declare-datatypes`` and datatype parameters are numbered.
        """

        return self.normal_form if self.normal_form is not None else self.canonical

    @property
    def identity_references(self) -> frozenset[str]:
        """Return the symbols that :attr:`identity` mentions besides the declared names."""

        return self.normal_references if self.normal_references is not None else self.references


@dataclass(frozen=True)
class ScopedItem:
    """An active declaration or assertion together with its assertion level."""

    kind: str
    command: Command
    level: int
    declaration: Declaration | None = None
    named: tuple[Declaration, ...] = ()


@dataclass(frozen=True)
class Query:
    """One satisfiability question posed by a script.

    The query is the conjunction of ``assertions`` and ``assumptions`` over the
    symbols introduced by ``declarations``.  ``kind`` is ``check-sat``,
    ``check-sat-assuming`` or ``implicit`` (the final assertion stack of a
    script without any check command, or of any script under the one-set
    semantics).
    """

    index: int
    kind: str
    command: Command | None
    items: tuple[ScopedItem, ...]
    assumptions: tuple[SExpr, ...]
    depth: int

    @property
    def assertions(self) -> tuple[ScopedItem, ...]:
        """Return the active assertions in the order they were issued."""

        return tuple(item for item in self.items if item.kind == "assertion")

    @property
    def declarations(self) -> tuple[Declaration, ...]:
        """Return every active declaration, definition and named label in order."""

        result: list[Declaration] = []
        item: ScopedItem
        for item in self.items:
            if item.declaration is not None:
                result.append(item.declaration)
            result.extend(item.named)
        return tuple(result)

    @property
    def line(self) -> int | None:
        """Return the source line of the check command, if there is one."""

        return self.command.line if self.command is not None else None

    def describe(self) -> str:
        """Return a short human-readable reference to this query."""

        if self.command is None:
            return f"query #{self.index} (final assertion stack)"
        return f"query #{self.index} ({self.kind}, command #{self.command.index}, line {self.command.line})"


@dataclass(frozen=True)
class Script:
    """Hold the commands, queries and diagnostics of one interpreted script."""

    commands: tuple[Command, ...]
    queries: tuple[Query, ...]
    diagnostics: tuple[str, ...]
    logic: str | None
    symbol_names: frozenset[str]


def _symbol(node: SExpr | None, what: str, command: Command) -> str:
    """Return the name of a symbol argument or raise a script error."""

    if not isinstance(node, Atom) or not node.is_symbol():
        raise ScriptError(f"expected {what}", command)
    return node.value


def _list(node: SExpr | None, what: str, command: Command) -> SList:
    """Return a list argument or raise a script error."""

    if not isinstance(node, SList):
        raise ScriptError(f"expected {what}", command)
    return node


def _constructors(declaration: SExpr, command: Command) -> list[str]:
    """Return constructor and selector names of one datatype declaration body."""

    body: SList = _list(declaration, "a datatype declaration", command)
    constructors: tuple[SExpr, ...] = body.items
    if body.items and isinstance(body.items[0], Atom) and body.items[0].is_symbol("par"):
        constructors = _list(body.items[2] if len(body.items) > 2 else None, "constructors after 'par'", command).items
    names: list[str] = []
    constructor: SExpr
    for constructor in constructors:
        if isinstance(constructor, Atom):
            names.append(_symbol(constructor, "a constructor name", command))
            continue
        names.append(_symbol(constructor.items[0] if constructor.items else None, "a constructor name", command))
        selector: SExpr
        for selector in constructor.items[1:]:
            selector_list: SList = _list(selector, "a selector declaration", command)
            names.append(_symbol(selector_list.items[0] if selector_list.items else None, "a selector name", command))
    return names


def _datatypes(command: Command) -> tuple[list[str], list[str]]:
    """Return sort names and constructor/selector names of a datatype command."""

    args: tuple[SExpr, ...] = command.args
    if command.name == "declare-datatype":
        if len(args) != 2:
            raise ScriptError("declare-datatype expects a name and a declaration", command)
        return [_symbol(args[0], "a datatype name", command)], _constructors(args[1], command)
    if len(args) != 2:
        raise ScriptError("declare-datatypes expects two lists", command)
    heads: SList = _list(args[0], "a list of sort declarations", command)
    bodies: SList = _list(args[1], "a list of datatype declarations", command)
    sorts: list[str] = []
    members: list[str] = []
    if heads.items and all(isinstance(head, SList) for head in heads.items):
        head: SExpr
        for head in heads.items:
            assert isinstance(head, SList)
            sorts.append(_symbol(head.items[0] if head.items else None, "a datatype name", command))
        if len(bodies.items) != len(sorts):
            raise ScriptError("declare-datatypes lists have different lengths", command)
        body: SExpr
        for body in bodies.items:
            members.extend(_constructors(body, command))
        return sorts, members
    # Legacy SMT-LIB 2.5 syntax accepted by Z3: (declare-datatypes (params) ((Name ctor...) ...))
    for body in bodies.items:
        entry: SList = _list(body, "a datatype declaration", command)
        sorts.append(_symbol(entry.items[0] if entry.items else None, "a datatype name", command))
        members.extend(_constructors(SList(entry.items[1:], entry.line, entry.column, entry.start, entry.end), command))
    return sorts, members


def _make_symbol(name: str) -> Atom:
    """Return a synthetic symbol atom (used only for normal forms)."""

    return Atom("symbol", name, symbol_text(name), 0, 0)


def _make_atom(kind: str, raw: str) -> Atom:
    """Return a synthetic non-symbol atom (used only for normal forms)."""

    return Atom(kind, raw, raw, 0, 0)


def _make_list(items: list[SExpr] | tuple[SExpr, ...]) -> SList:
    """Return a synthetic list (used only for normal forms)."""

    return SList(tuple(items), 0, 0, 0, 0)


def _substitute(node: SExpr, mapping: Mapping[str, SExpr]) -> SExpr:
    """Replace the symbols in ``mapping`` (sort parameters) inside a sort expression."""

    if isinstance(node, Atom):
        return mapping.get(node.value, node) if node.is_symbol() else node
    return _make_list([_substitute(child, mapping) for child in node.items])


def expand_sort(node: SExpr, aliases: SortAliases, bound: frozenset[str] = frozenset()) -> SExpr:
    """Expand the sort aliases (``define-sort``) of a sort expression.

    ``bound`` holds sort parameters in scope, which shadow aliases.  The
    identifier of an indexed sort such as ``(_ BitVec 8)`` is never expanded.
    """

    if isinstance(node, Atom):
        if node.is_symbol() and node.value not in bound and node.value in aliases:
            parameters, body = aliases[node.value]
            if not parameters:
                return body
        return node
    head: SExpr | None = node.items[0] if node.items else None
    if isinstance(head, Atom) and head.is_symbol("_"):
        return node
    items: list[SExpr] = [expand_sort(child, aliases, bound) for child in node.items]
    if isinstance(head, Atom) and head.is_symbol() and head.value not in bound and head.value in aliases:
        parameters, body = aliases[head.value]
        if parameters and len(parameters) == len(items) - 1:
            return _substitute(body, dict(zip(parameters, items[1:])))
    return _make_list(items)


def _datatype_bodies(command: Command) -> list[tuple[str, tuple[str, ...], tuple[SExpr, ...]]]:
    """Return ``(sort name, parameters, constructors)`` for each datatype of a command."""

    def split(body: SExpr) -> tuple[tuple[str, ...], tuple[SExpr, ...]]:
        entry: SList = _list(body, "a datatype declaration", command)
        if entry.items and isinstance(entry.items[0], Atom) and entry.items[0].is_symbol("par"):
            parameters: SList = _list(entry.items[1] if len(entry.items) > 1 else None, "datatype parameters", command)
            constructors: SList = _list(entry.items[2] if len(entry.items) > 2 else None, "constructors after 'par'", command)
            return tuple(_symbol(item, "a sort parameter", command) for item in parameters.items), constructors.items
        return (), entry.items

    args: tuple[SExpr, ...] = command.args
    if command.name == "declare-datatype":
        parameters, constructors = split(args[1])
        return [(_symbol(args[0], "a datatype name", command), parameters, constructors)]
    heads: SList = _list(args[0], "a list of sort declarations", command)
    bodies: SList = _list(args[1], "a list of datatype declarations", command)
    if heads.items and all(isinstance(head, SList) for head in heads.items):
        result: list[tuple[str, tuple[str, ...], tuple[SExpr, ...]]] = []
        for head, body in zip(heads.items, bodies.items):
            assert isinstance(head, SList)
            parameters, constructors = split(body)
            result.append((_symbol(head.items[0] if head.items else None, "a datatype name", command), parameters, constructors))
        return result
    # Legacy syntax: (declare-datatypes (params) ((Name ctor...) ...)) with shared parameters.
    shared: tuple[str, ...] = tuple(_symbol(item, "a sort parameter", command) for item in heads.items)
    legacy: list[tuple[str, tuple[str, ...], tuple[SExpr, ...]]] = []
    for body in bodies.items:
        entry: SList = _list(body, "a datatype declaration", command)
        legacy.append((_symbol(entry.items[0] if entry.items else None, "a datatype name", command), shared, entry.items[1:]))
    return legacy


def _datatype_normal_form(command: Command, aliases: SortAliases) -> SList:
    """Return ``declare-datatypes`` with numbered parameters and expanded field sorts."""

    heads: list[SExpr] = []
    bodies: list[SExpr] = []
    name: str
    parameters: tuple[str, ...]
    constructors: tuple[SExpr, ...]
    for name, parameters, constructors in _datatype_bodies(command):
        heads.append(_make_list([_make_symbol(name), _make_atom("numeral", str(len(parameters)))]))
        bodies.append(_datatype_body(parameters, _normal_constructors(constructors, parameters, aliases, command)))
    return _make_list([_make_symbol("declare-datatypes"), _make_list(heads), _make_list(bodies)])


def _normal_constructors(
    constructors: tuple[SExpr, ...], parameters: tuple[str, ...], aliases: SortAliases, command: Command,
) -> list[SList]:
    """Return the constructors of one datatype with numbered parameters and expanded field sorts."""

    numbered: dict[str, SExpr] = {parameter: _make_atom("parameter", f"#{index}") for index, parameter in enumerate(parameters)}
    normal: list[SList] = []
    constructor: SExpr
    for constructor in constructors:
        if isinstance(constructor, Atom):
            normal.append(_make_list([constructor]))
            continue
        fields: list[SExpr] = [constructor.items[0]]
        selector: SExpr
        for selector in constructor.items[1:]:
            selector_list: SList = _list(selector, "a selector declaration", command)
            if len(selector_list.items) != 2:
                raise ScriptError("a selector declaration needs a name and a sort", command)
            sort: SExpr = _substitute(expand_sort(selector_list.items[1], aliases, frozenset(parameters)), numbered)
            fields.append(_make_list([selector_list.items[0], sort]))
        normal.append(_make_list(fields))
    return normal


def _datatype_body(parameters: tuple[str, ...], constructors: list[SList]) -> SExpr:
    """Return the body of a normalised datatype, wrapped in ``par`` when it has parameters."""

    body: SExpr = _make_list(constructors)
    if parameters:
        numbered: list[SExpr] = [_make_atom("parameter", f"#{index}") for index in range(len(parameters))]
        body = _make_list([_make_symbol("par"), _make_list(numbered), body])
    return body


def _datatype_members(command: Command, aliases: SortAliases) -> tuple[DatatypeMember, ...]:
    """Return one order-independent identity per datatype of a datatype command.

    The order of the constructors of a datatype, the order of the datatypes in
    a ``declare-datatypes`` block and the grouping into commands do not change
    the meaning, so they do not enter the identity.  The order of the fields of
    a constructor does: it is the order of the constructor's arguments.
    """

    members: list[DatatypeMember] = []
    name: str
    parameters: tuple[str, ...]
    constructors: tuple[SExpr, ...]
    for name, parameters, constructors in _datatype_bodies(command):
        normal: list[SList] = sorted(_normal_constructors(constructors, parameters, aliases, command), key=canonical)
        identity: str = canonical(_make_list([
            _make_symbol("declare-datatype"), _make_symbol(name), _make_atom("numeral", str(len(parameters))),
            _datatype_body(parameters, normal),
        ]))
        # A datatype only refers to the sorts of its fields; its own sort may occur there (recursion).
        references: set[str] = set()
        functions: list[str] = []
        constructor: SList
        for constructor in normal:
            head: SExpr = constructor.items[0]
            functions.append(head.value if isinstance(head, Atom) else canonical(head))
            field: SExpr
            for field in constructor.items[1:]:
                assert isinstance(field, SList)
                selector: SExpr = field.items[0]
                functions.append(selector.value if isinstance(selector, Atom) else canonical(selector))
                references |= symbols_in(field.items[1])
        references.discard(name)
        frozen: frozenset[str] = frozenset(references)
        members.append(DatatypeMember("sort", name, name, identity, frozen))
        members.extend(DatatypeMember("function", function, name, identity, frozen) for function in functions)
    return tuple(members)


def _normal_form(command: Command, aliases: SortAliases) -> SList | None:
    """Return the notation-independent form of a declaration, or None to use its canonical text."""

    args: tuple[SExpr, ...] = command.args
    if command.name == "declare-const" and len(args) == 2:
        return _make_list([_make_symbol("declare-fun"), args[0], _make_list([]), expand_sort(args[1], aliases)])
    if command.name == "declare-fun" and len(args) == 3 and isinstance(args[1], SList):
        domain: list[SExpr] = [expand_sort(sort, aliases) for sort in args[1].items]
        return _make_list([_make_symbol("declare-fun"), args[0], _make_list(domain), expand_sort(args[2], aliases)])
    if command.name == "declare-sort" and len(args) in (1, 2):
        arity: SExpr = args[1] if len(args) == 2 else _make_atom("numeral", "0")
        return _make_list([_make_symbol("declare-sort"), args[0], arity])
    if command.name in ("declare-datatype", "declare-datatypes"):
        return _datatype_normal_form(command, aliases)
    return None


def declaration_of(command: Command, aliases: SortAliases | None = None) -> Declaration:
    """Describe the symbols that a declaration command introduces.

    ``aliases`` maps the sort aliases active at the command to their
    ``(parameters, expanded body)``; they are expanded in the normal form.
    """

    aliases = aliases or {}
    args: tuple[SExpr, ...] = command.args
    names: list[str]
    sort_names: list[str] = []
    arity: int | None = None
    category: str
    if command.name in FUNCTION_CATEGORIES:
        names = [_symbol(args[0] if args else None, "a symbol name", command)]
        category = FUNCTION_CATEGORIES[command.name]
        if command.name == "declare-fun" and len(args) == 3:
            arity = len(_list(args[1], "a list of argument sorts", command).items)
        elif command.name in ("define-fun", "define-fun-rec") and len(args) == 4:
            arity = len(_list(args[1], "a list of parameters", command).items)
        elif command.name in ("declare-const", "define-const"):
            arity = 0
    elif command.name == "define-funs-rec":
        heads: SList = _list(args[0] if args else None, "a list of function declarations", command)
        names = [_symbol(_list(head, "a function declaration", command).items[0] if isinstance(head, SList) and head.items else None, "a function name", command) for head in heads.items]
        category = "recursive"
    elif command.name in ("declare-sort", "define-sort"):
        names = [_symbol(args[0] if args else None, "a sort name", command)]
        sort_names = list(names)
        category = "sort" if command.name == "declare-sort" else "sort-alias"
    elif command.name in ("declare-datatype", "declare-datatypes"):
        sort_names, members = _datatypes(command)
        names = sort_names + members
        category = "datatype"
    else:
        names = [args[0].value] if args and isinstance(args[0], Atom) and args[0].is_symbol() else []
        category = "other"
    references: frozenset[str] = symbols_in(command.sexpr) - {command.name} - set(names)
    normal: SList | None = _normal_form(command, aliases)
    normal_form: str | None = None
    normal_references: frozenset[str] | None = None
    if normal is not None:
        normal_form = canonical(normal)
        normal_references = symbols_in(normal) - NORMAL_KEYWORDS - set(names)
    alias_definition: tuple[tuple[str, ...], SExpr] | None = None
    if command.name == "define-sort" and len(args) == 3 and isinstance(args[1], SList):
        parameters: tuple[str, ...] = tuple(_symbol(item, "a sort parameter", command) for item in args[1].items)
        alias_definition = (parameters, expand_sort(args[2], aliases, frozenset(parameters)))
    return Declaration(
        command, tuple(names), tuple(sort_names), category, canonical(command.sexpr), references, arity,
        normal_form, normal_references, alias_definition, _signature(command, aliases),
        _datatype_members(command, aliases) if category == "datatype" else (),
    )


def _signature(command: Command, aliases: SortAliases) -> tuple[tuple[SExpr, ...], SExpr] | None:
    """Return the argument sorts and the result sort of a function declaration or definition."""

    args: tuple[SExpr, ...] = command.args
    if command.name in ("declare-const", "define-const") and len(args) >= 2:
        return (), expand_sort(args[1], aliases)
    if command.name == "declare-fun" and len(args) == 3 and isinstance(args[1], SList):
        return tuple(expand_sort(sort, aliases) for sort in args[1].items), expand_sort(args[2], aliases)
    if command.name in ("define-fun", "define-fun-rec") and len(args) == 4 and isinstance(args[1], SList):
        domain: list[SExpr] = []
        parameter: SExpr
        for parameter in args[1].items:
            if not isinstance(parameter, SList) or len(parameter.items) != 2:
                return None
            domain.append(expand_sort(parameter.items[1], aliases))
        return tuple(domain), expand_sort(args[2], aliases)
    return None


def named_terms(command: Command) -> tuple[Declaration, ...]:
    """Return the ``(! t :named n)`` labels that an assertion defines."""

    found: list[Declaration] = []
    pending: list[SExpr] = list(command.args)
    cursor: int = 0
    while cursor < len(pending):
        node: SExpr = pending[cursor]
        cursor += 1
        if not isinstance(node, SList):
            continue
        items: tuple[SExpr, ...] = node.items
        if items and isinstance(items[0], Atom) and items[0].is_symbol("!") and len(items) >= 2:
            position: int
            for position in range(2, len(items) - 1):
                attribute: SExpr = items[position]
                if isinstance(attribute, Atom) and attribute.kind == "keyword" and attribute.value == ":named":
                    name: str = _symbol(items[position + 1], "a name after :named", command)
                    term: SExpr = items[1]
                    found.append(Declaration(
                        command, (name,), (), "named",
                        f"(! {canonical(term)} :named {name})", symbols_in(term) - {name}, 0,
                    ))
        pending.extend(items)
    return tuple(found)


def _numeral(command: Command) -> int:
    """Return the optional numeral argument of push/pop (default 1)."""

    if not command.args:
        return 1
    argument: SExpr = command.args[0]
    if len(command.args) != 1 or not isinstance(argument, Atom) or argument.kind != "numeral":
        raise ScriptError(f"({command.name}) expects a numeral", command)
    return int(argument.value)


@dataclass
class _State:
    """Mutable assertion-stack state of the interpreter."""

    items: list[ScopedItem] = field(default_factory=list)
    active_sorts: dict[str, Command] = field(default_factory=dict)
    active_functions: dict[str, Command] = field(default_factory=dict)
    aliases: dict[str, tuple[tuple[str, ...], SExpr]] = field(default_factory=dict)
    depth: int = 0
    global_declarations: bool = False
    started: bool = False
    logic: str | None = None


class _Interpreter:
    """Execute commands against a symbolic assertion stack.

    With ``one_set`` the check commands pose no query; the script is reduced
    to one implicit query over the final assertion stack (an ablation that
    compares the final state only).
    """

    def __init__(self, one_set: bool = False) -> None:
        self.state: _State = _State()
        self.queries: list[Query] = []
        self.diagnostics: list[str] = []
        self.checked: set[int] = set()
        self.assertion_commands: list[Command] = []
        self.logic: str | None = None
        self.one_set: bool = one_set

    def warn(self, command: Command, message: str) -> None:
        """Record a non-fatal diagnostic for one command."""

        self.diagnostics.append(f"[Warning] command #{command.index} (line {command.line}): {message}")

    def run(self, commands: list[Command]) -> None:
        """Execute all commands up to the first ``exit``."""

        position: int
        command: Command
        for position, command in enumerate(commands):
            if command.name == "exit":
                if position + 1 < len(commands):
                    self.warn(command, f"{len(commands) - position - 1} command(s) after (exit) are ignored")
                break
            self.execute(command)
        if self.one_set:
            self.query(None, (), "implicit", final=True)
            self.diagnostics.append("[Info] one-set semantics: only the final assertion stack is compared")
        elif not self.queries:
            self.query(None, (), "implicit")
            self.diagnostics.append("[Info] no check-sat command: the final assertion stack is compared")
        dead: list[Command] = [command for command in self.assertion_commands if command.index not in self.checked]
        for command in dead:
            self.warn(command, "assertion is never part of a check-sat query and does not affect the comparison")

    def execute(self, command: Command) -> None:
        """Apply one command to the assertion stack."""

        name: str = command.name
        state: _State = self.state
        if name in DECLARATION_COMMANDS or (name.startswith(("declare-", "define-"))):
            declaration: Declaration = declaration_of(command, state.aliases)
            if declaration.category == "other":
                self.warn(command, f"'{name}' is passed to the solver without interpretation")
            self.introduce(declaration, command)
            if declaration.alias_definition is not None:
                state.aliases[declaration.names[0]] = declaration.alias_definition
            state.items.append(ScopedItem("declaration", command, state.depth, declaration))
            state.started = True
        elif name == "assert":
            if len(command.args) != 1:
                raise ScriptError("assert expects exactly one term", command)
            labels: tuple[Declaration, ...] = named_terms(command)
            label: Declaration
            for label in labels:
                self.introduce(label, command)
            state.items.append(ScopedItem("assertion", command, state.depth, None, labels))
            self.assertion_commands.append(command)
            state.started = True
        elif name == "push":
            state.depth += _numeral(command)
            state.started = True
        elif name == "pop":
            count: int = _numeral(command)
            if count > state.depth:
                raise ScriptError(f"(pop {count}) exceeds the current assertion-stack depth {state.depth}", command)
            self.pop_to(state.depth - count, command)
        elif name == "check-sat":
            if command.args:
                self.warn(command, "check-sat with arguments is treated as check-sat-assuming (Z3 extension)")
                self.query(command, command.args, "check-sat-assuming")
            else:
                self.query(command, (), "check-sat")
        elif name == "check-sat-assuming":
            if len(command.args) != 1 or not isinstance(command.args[0], SList):
                raise ScriptError("check-sat-assuming expects one list of literals", command)
            self.query(command, command.args[0].items, "check-sat-assuming")
        elif name == "reset":
            self.state = _State()
        elif name == "reset-assertions":
            self.pop_to(0, command, clear_base=True)
        elif name == "set-logic":
            if state.logic is not None:
                self.warn(command, "the logic is already set")
            state.logic = _symbol(command.args[0] if command.args else None, "a logic name", command)
            self.logic = self.logic or state.logic
        elif name == "set-option":
            self.set_option(command)
        elif name not in IGNORED_COMMANDS:
            self.warn(command, f"unsupported command '{name}' is ignored")

    def introduce(self, declaration: Declaration, command: Command) -> None:
        """Register new symbols, rejecting redeclarations of active symbols.

        Sort symbols and function symbols live in separate namespaces, so a
        datatype may have a constructor with the name of its sort.
        """

        namespaces: list[tuple[dict[str, Command], tuple[str, ...], str]] = [
            (self.state.active_sorts, declaration.sort_names, "sort"),
            (self.state.active_functions, declaration.function_names, "symbol"),
        ]
        table: dict[str, Command]
        names: tuple[str, ...]
        noun: str
        for table, names, noun in namespaces:
            if len(set(names)) != len(names):
                raise ScriptError(f"{noun} names are declared twice in one command", command)
            name: str
            for name in names:
                previous: Command | None = table.get(name)
                if previous is not None:
                    raise ScriptError(f"{noun} '{name}' is already declared by command #{previous.index}", command)
        for table, names, noun in namespaces:
            for name in names:
                table[name] = command

    def pop_to(self, depth: int, command: Command, clear_base: bool = False) -> None:
        """Remove every item above ``depth`` (or everything for reset-assertions)."""

        state: _State = self.state
        kept: list[ScopedItem] = []
        item: ScopedItem
        for item in state.items:
            removed: bool = clear_base or item.level > depth
            if not removed:
                kept.append(item)
                continue
            if state.global_declarations and item.kind == "declaration":
                kept.append(item)
                continue
            if state.global_declarations and item.named:
                raise ScriptError(
                    "named terms in removed assertions are unsupported with :global-declarations", command
                )
            declaration: Declaration
            for declaration in ((item.declaration,) if item.declaration is not None else ()) + item.named:
                for name in declaration.sort_names:
                    state.active_sorts.pop(name, None)
                    state.aliases.pop(name, None)
                for name in declaration.function_names:
                    state.active_functions.pop(name, None)
        state.items = kept
        state.depth = depth

    def set_option(self, command: Command) -> None:
        """Handle options that change the assertion-stack semantics."""

        if len(command.args) >= 1 and isinstance(command.args[0], Atom) and command.args[0].value == ":global-declarations":
            if self.state.started:
                raise ScriptError(":global-declarations can only be set before any declaration, assertion or push", command)
            value: SExpr | None = command.args[1] if len(command.args) > 1 else None
            if not isinstance(value, Atom) or value.value not in ("true", "false"):
                raise ScriptError(":global-declarations expects true or false", command)
            self.state.global_declarations = value.value == "true"

    def query(self, command: Command | None, assumptions: tuple[SExpr, ...], kind: str, final: bool = False) -> None:
        """Record the current assertion stack as one satisfiability query.

        In one-set mode only the final query (``final=True``) is recorded.
        """

        if self.one_set and not final:
            return
        items: tuple[ScopedItem, ...] = tuple(self.state.items)
        item: ScopedItem
        for item in items:
            if item.kind == "assertion":
                self.checked.add(item.command.index)
        self.queries.append(Query(len(self.queries) + 1, kind, command, items, tuple(assumptions), self.state.depth))


class SMTParser:
    """Parse SMT-LIB scripts into queries."""

    @staticmethod
    def extract_s_expressions(text: str) -> list[str]:
        """Return the source text of every top-level command, without surrounding comments."""

        return [command.text for command in read_commands(text)]

    @staticmethod
    def parse_script(script_text: str, one_set: bool = False) -> Script:
        """Interpret a script and return its queries and diagnostics.

        With ``one_set`` the script has exactly one query: the final assertion
        stack (after the last command or ``exit``), without assumptions.

        Raises :class:`sexpr.SMTLibSyntaxError` for lexical errors and
        :class:`ScriptError` for scripts that are ill-formed under the
        assertion-stack semantics (for example ``pop`` below level 0).
        """

        commands: list[Command] = read_commands(script_text)
        interpreter: _Interpreter = _Interpreter(one_set)
        interpreter.run(commands)
        names: set[str] = set()
        command: Command
        for command in commands:
            names |= symbols_in(command.sexpr)
        return Script(
            tuple(commands),
            tuple(interpreter.queries),
            tuple(interpreter.diagnostics),
            interpreter.logic,
            frozenset(names),
        )


__all__ = [
    "Command",
    "Declaration",
    "Query",
    "SMTLibSyntaxError",
    "SMTParser",
    "Script",
    "ScopedItem",
    "ScriptError",
    "declaration_of",
    "named_terms",
    "render",
]
