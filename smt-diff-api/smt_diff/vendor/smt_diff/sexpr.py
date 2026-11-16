"""Read SMT-LIB 2.6 S-expressions with source positions.

The reader implements the lexical syntax of SMT-LIB 2.6 (Section 3.1 of the
standard): comments, string literals with ``""`` escapes, quoted symbols
``|...|``, keywords, numerals, decimals, hexadecimals and binaries.  Unlike a
regular-expression scan it never mistakes a ``;`` or a parenthesis inside a
string literal or a quoted symbol for syntax.
"""

import re
from dataclasses import dataclass
from typing import Iterator, Mapping, Union

SIMPLE_SYMBOL = re.compile(r"[A-Za-z~!@$%^&*_\-+=<>.?/][A-Za-z0-9~!@$%^&*_\-+=<>.?/]*\Z")
NUMERAL = re.compile(r"(0|[1-9][0-9]*)\Z")
DECIMAL = re.compile(r"(0|[1-9][0-9]*)\.[0-9]+\Z")
HEXADECIMAL = re.compile(r"#x[0-9A-Fa-f]+\Z")
BINARY = re.compile(r"#b[01]+\Z")
RESERVED_WORDS: frozenset[str] = frozenset({
    "!", "_", "as", "BINARY", "DECIMAL", "exists", "HEXADECIMAL", "forall",
    "let", "match", "NUMERAL", "par", "STRING",
})
DELIMITERS: frozenset[str] = frozenset(' \t\r\n()";|')


class SMTLibSyntaxError(ValueError):
    """Report malformed SMT-LIB text with a 1-based source position."""

    def __init__(self, message: str, line: int, column: int) -> None:
        super().__init__(f"line {line}, column {column}: {message}")
        self.line: int = line
        self.column: int = column


@dataclass(frozen=True)
class Atom:
    """Represent one lexical token that is not a parenthesis."""

    kind: str
    value: str
    raw: str
    line: int
    column: int
    quoted: bool = False

    def is_symbol(self, name: str | None = None) -> bool:
        """Return True for a symbol, optionally one with the given name."""

        return self.kind == "symbol" and (name is None or self.value == name)


@dataclass(frozen=True)
class SList:
    """Represent a parenthesized list together with its source span."""

    items: tuple["SExpr", ...]
    line: int
    column: int
    start: int
    end: int


SExpr = Union[Atom, SList]


@dataclass(frozen=True)
class Command:
    """Represent one top-level SMT-LIB command."""

    index: int
    name: str
    sexpr: SList
    text: str
    line: int

    @property
    def args(self) -> tuple[SExpr, ...]:
        """Return the command arguments after the command name."""

        return self.sexpr.items[1:]


def symbol_text(name: str, quoted: bool = False) -> str:
    """Render a symbol name, adding bars whenever bare text would change its meaning."""

    if not quoted and SIMPLE_SYMBOL.match(name) and name not in RESERVED_WORDS:
        return name
    return f"|{name}|"


def _classify(raw: str, line: int, column: int) -> Atom:
    """Classify an unquoted token according to the SMT-LIB lexicon."""

    if raw.startswith(":"):
        if len(raw) == 1:
            raise SMTLibSyntaxError("empty keyword", line, column)
        return Atom("keyword", raw, raw, line, column)
    if NUMERAL.match(raw):
        return Atom("numeral", raw, raw, line, column)
    if DECIMAL.match(raw):
        return Atom("decimal", raw, raw, line, column)
    if HEXADECIMAL.match(raw):
        return Atom("hexadecimal", raw, raw, line, column)
    if BINARY.match(raw):
        return Atom("binary", raw, raw, line, column)
    if raw[0].isdigit() or raw[0] == "#":
        raise SMTLibSyntaxError(f"invalid token '{raw}'", line, column)
    return Atom("symbol", raw, raw, line, column)


def _tokens(text: str) -> Iterator[tuple[str, int, int, int, Atom | None]]:
    """Yield ``(kind, offset, line, column, atom)`` for each token in ``text``."""

    index: int = 0
    line: int = 1
    line_start: int = 0
    length: int = len(text)
    while index < length:
        character: str = text[index]
        column: int = index - line_start + 1
        if character == "\n":
            index += 1
            line += 1
            line_start = index
        elif character in " \t\r":
            index += 1
        elif character == ";":
            while index < length and text[index] != "\n":
                index += 1
        elif character == "(" or character == ")":
            yield character, index, line, column, None
            index += 1
        elif character == '"':
            start: int = index
            start_line: int = line
            index += 1
            while True:
                if index >= length:
                    raise SMTLibSyntaxError("unterminated string literal", start_line, column)
                if text[index] == '"':
                    if index + 1 < length and text[index + 1] == '"':
                        index += 2
                        continue
                    index += 1
                    break
                if text[index] == "\n":
                    line += 1
                    line_start = index + 1
                index += 1
            raw: str = text[start:index]
            yield "atom", start, start_line, column, Atom("string", raw, raw, start_line, column)
        elif character == "|":
            start = index
            start_line = line
            index += 1
            while index < length and text[index] != "|":
                if text[index] == "\n":
                    line += 1
                    line_start = index + 1
                index += 1
            if index >= length:
                raise SMTLibSyntaxError("unterminated quoted symbol", start_line, column)
            index += 1
            raw = text[start:index]
            yield "atom", start, start_line, column, Atom("symbol", raw[1:-1], raw, start_line, column, quoted=True)
        else:
            start = index
            while index < length and text[index] not in DELIMITERS:
                index += 1
            yield "atom", start, line, column, _classify(text[start:index], line, column)


def read_sexprs(text: str) -> list[SExpr]:
    """Return every top-level S-expression in ``text``."""

    stack: list[tuple[list[SExpr], int, int, int]] = []
    result: list[SExpr] = []
    kind: str
    offset: int
    line: int
    column: int
    atom: Atom | None
    for kind, offset, line, column, atom in _tokens(text):
        if kind == "(":
            stack.append(([], offset, line, column))
        elif kind == ")":
            if not stack:
                raise SMTLibSyntaxError("unexpected ')'", line, column)
            items, start, start_line, start_column = stack.pop()
            node: SExpr = SList(tuple(items), start_line, start_column, start, offset + 1)
            (stack[-1][0] if stack else result).append(node)
        else:
            assert atom is not None
            (stack[-1][0] if stack else result).append(atom)
    if stack:
        _, _, open_line, open_column = stack[-1]
        raise SMTLibSyntaxError("unbalanced '(' (missing ')')", open_line, open_column)
    return result


def read_commands(text: str) -> list[Command]:
    """Return the top-level commands of a script, rejecting stray tokens."""

    commands: list[Command] = []
    node: SExpr
    for node in read_sexprs(text):
        if isinstance(node, Atom):
            raise SMTLibSyntaxError(f"unexpected token '{node.raw}' outside of a command", node.line, node.column)
        if not node.items or not isinstance(node.items[0], Atom) or not node.items[0].is_symbol():
            raise SMTLibSyntaxError("a command must start with a command name", node.line, node.column)
        head: Atom = node.items[0]
        commands.append(Command(len(commands) + 1, head.value, node, text[node.start:node.end], node.line))
    return commands


def render(node: SExpr, renaming: Mapping[str, str] | None = None) -> str:
    """Render an S-expression back to SMT-LIB text, optionally renaming symbols.

    Renaming is uniform: every occurrence of a mapped symbol is replaced,
    including binders, so the result is alpha-equivalent whenever the new
    names are fresh.  The identifier position of an indexed identifier
    ``(_ id index...)`` names a theory operation and is never renamed.
    """

    if isinstance(node, Atom):
        if node.kind == "symbol" and renaming and node.value in renaming:
            return symbol_text(renaming[node.value])
        return node.raw
    parts: list[str] = []
    position: int
    child: SExpr
    indexed: bool = bool(node.items) and isinstance(node.items[0], Atom) and node.items[0].is_symbol("_")
    for position, child in enumerate(node.items):
        if indexed and position == 1:
            parts.append(render(child))
        else:
            parts.append(render(child, renaming))
    return "(" + " ".join(parts) + ")"


def canonical(node: SExpr) -> str:
    """Render a whitespace- and quoting-insensitive normal form of an S-expression."""

    if isinstance(node, Atom):
        if node.kind == "symbol":
            return symbol_text(node.value) if node.quoted else node.value
        return node.raw
    return "(" + " ".join(canonical(child) for child in node.items) + ")"


def symbols_in(node: SExpr) -> frozenset[str]:
    """Return the names of all symbols that occur anywhere in ``node``."""

    found: set[str] = set()
    pending: list[SExpr] = [node]
    while pending:
        current: SExpr = pending.pop()
        if isinstance(current, Atom):
            if current.kind == "symbol":
                found.add(current.value)
        else:
            pending.extend(current.items)
    return frozenset(found)
