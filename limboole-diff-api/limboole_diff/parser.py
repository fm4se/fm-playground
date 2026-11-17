"""Parse Limboole formulas into a small AST. The grammar and the scanner follow the Limboole binary
"""

from dataclasses import dataclass
from typing import Union

VARIABLE_START: frozenset[str] = frozenset("_.[]$@")

class LimbooleSyntaxError(ValueError):
    """A formula that the Limboole binary would reject."""

    def __init__(self, message: str, line: int, column: int) -> None:
        super().__init__(f"{line}:{column}: {message}")
        self.message = message
        self.line = line
        self.column = column


@dataclass(frozen=True, eq=False)
class Var:
    name: str


@dataclass(frozen=True, eq=False)
class Not:
    arg: "Node"


@dataclass(frozen=True, eq=False)
class And:
    args: tuple["Node", ...]


@dataclass(frozen=True, eq=False)
class Or:
    args: tuple["Node", ...]


@dataclass(frozen=True, eq=False)
class Implies:
    lhs: "Node"
    rhs: "Node"


@dataclass(frozen=True, eq=False)
class Iff:
    lhs: "Node"
    rhs: "Node"


Node = Union[Var, Not, And, Or, Implies, Iff]


@dataclass(frozen=True)
class _Token:
    kind: str  # 'var', '(', ')', '&', '|', '!', '->', '<-', '<->', 'EOF'
    text: str
    line: int
    column: int


def _is_variable_char(char: str, first: bool) -> bool:
    return char.isascii() and (char.isalnum() or char in VARIABLE_START or (not first and char == "-"))


def tokenize(text: str) -> list[_Token]:
    """Split ``text`` into tokens, raising :class:`LimbooleSyntaxError` like Limboole's scanner."""

    tokens: list[_Token] = []
    position, line, column = 0, 1, 1

    def advance(count: int = 1) -> None:
        nonlocal position, line, column
        for _ in range(count):
            if text[position] == "\n":
                line, column = line + 1, 1
            else:
                column += 1
            position += 1

    while position < len(text):
        char = text[position]
        if char.isspace():
            advance()
            continue
        if char == "%":
            while position < len(text) and text[position] != "\n":
                advance()
            continue
        start_line, start_column = line, column
        if char in "()&|":
            tokens.append(_Token(char, char, start_line, start_column))
            advance()
        elif char in "!~":
            tokens.append(_Token("!", char, start_line, start_column))
            advance()
        elif char == "-":
            if text.startswith("->", position):
                tokens.append(_Token("->", "->", start_line, start_column))
                advance(2)
            else:
                tokens.append(_Token("!", "-", start_line, start_column))
                advance()
        elif char == "<":
            if text.startswith("<->", position):
                tokens.append(_Token("<->", "<->", start_line, start_column))
                advance(3)
            elif text.startswith("<-", position):
                tokens.append(_Token("<-", "<-", start_line, start_column))
                advance(2)
            else:
                raise LimbooleSyntaxError("expected '-' after '<'", start_line, start_column)
        elif _is_variable_char(char, first=True):
            end = position
            while end < len(text) and _is_variable_char(text[end], first=False):
                end += 1
            name = text[position:end]
            if name.endswith("-"):
                raise LimbooleSyntaxError(f"variable '{name}' ends with '-'", start_line, start_column)
            tokens.append(_Token("var", name, start_line, start_column))
            advance(end - position)
        else:
            raise LimbooleSyntaxError(f"invalid character '{char}'", start_line, start_column)
    tokens.append(_Token("EOF", "EOF", line, column))
    return tokens


class _Parser:
    def __init__(self, text: str) -> None:
        self.tokens = tokenize(text)
        self.index = 0

    @property
    def token(self) -> _Token:
        return self.tokens[self.index]

    def error(self, expected: str) -> LimbooleSyntaxError:
        token = self.token
        return LimbooleSyntaxError(f"parse error at '{token.text}' expected {expected}", token.line, token.column)

    def accept(self, kind: str) -> bool:
        if self.token.kind == kind:
            self.index += 1
            return True
        return False

    def parse(self) -> Node:
        node = self.iff()
        if self.token.kind != "EOF":
            raise self.error("operator or EOF")
        return node

    def iff(self) -> Node:
        node = self.implies()
        while self.accept("<->"):
            node = Iff(node, self.implies())
        return node

    def implies(self) -> Node:
        node = self.disjunction()
        if self.accept("->"):
            return Implies(node, self.disjunction())
        if self.accept("<-"):
            return Implies(self.disjunction(), node)
        return node

    def disjunction(self) -> Node:
        args = [self.conjunction()]
        while self.accept("|"):
            args.append(self.conjunction())
        return args[0] if len(args) == 1 else Or(tuple(args))

    def conjunction(self) -> Node:
        args = [self.negation()]
        while self.accept("&"):
            args.append(self.negation())
        return args[0] if len(args) == 1 else And(tuple(args))

    def negation(self) -> Node:
        depth = 0
        while self.accept("!"):
            depth += 1
        node = self.basic()
        for _ in range(depth):
            node = Not(node)
        return node

    def basic(self) -> Node:
        token = self.token
        if token.kind == "var":
            self.index += 1
            return Var(token.text)
        if self.accept("("):
            node = self.iff()
            if not self.accept(")"):
                raise self.error("')'")
            return node
        raise self.error("variable or '('")


def parse(text: str) -> Node:
    """Parse a Limboole formula; raises :class:`LimbooleSyntaxError`."""

    try:
        return _Parser(text).parse()
    except RecursionError:
        raise LimbooleSyntaxError("formula is nested too deeply", 1, 1) from None


def children(node: Node) -> tuple[Node, ...]:
    if isinstance(node, Var):
        return ()
    if isinstance(node, Not):
        return (node.arg,)
    if isinstance(node, (And, Or)):
        return node.args
    return (node.lhs, node.rhs)


def variables(node: Node) -> list[str]:
    """Return the variable names of ``node`` in order of first occurrence."""

    names: dict[str, None] = {}
    seen: set[int] = set()
    pending: list[Node] = [node]
    while pending:
        current = pending.pop()
        if id(current) in seen:
            continue
        seen.add(id(current))
        if isinstance(current, Var):
            names.setdefault(current.name, None)
        else:
            pending.extend(reversed(children(current)))
    return list(names)


def evaluate(node: Node, assignment: dict[str, bool]) -> bool:
    """Return the truth value of ``node`` under ``assignment`` (which must assign all its variables)."""

    if isinstance(node, Var):
        return assignment[node.name]
    if isinstance(node, Not):
        return not evaluate(node.arg, assignment)
    if isinstance(node, And):
        return all(evaluate(arg, assignment) for arg in node.args)
    if isinstance(node, Or):
        return any(evaluate(arg, assignment) for arg in node.args)
    if isinstance(node, Implies):
        return not evaluate(node.lhs, assignment) or evaluate(node.rhs, assignment)
    return evaluate(node.lhs, assignment) == evaluate(node.rhs, assignment)


_PRECEDENCE: dict[type, int] = {Iff: 0, Implies: 1, Or: 2, And: 3, Not: 4, Var: 5}


def to_text(node: Node) -> str:
    """Print ``node`` in Limboole syntax with the parentheses its structure needs."""

    def wrap(child: Node, minimum: int) -> str:
        text = to_text(child)
        return f"({text})" if _PRECEDENCE[type(child)] < minimum else text

    if isinstance(node, Var):
        return node.name
    if isinstance(node, Not):
        return "!" + wrap(node.arg, _PRECEDENCE[Not])
    if isinstance(node, And):
        return " & ".join(wrap(arg, _PRECEDENCE[And] + 1) for arg in node.args)
    if isinstance(node, Or):
        return " | ".join(wrap(arg, _PRECEDENCE[Or] + 1) for arg in node.args)
    if isinstance(node, Implies):
        return f"{wrap(node.lhs, _PRECEDENCE[Or])} -> {wrap(node.rhs, _PRECEDENCE[Or])}"
    return f"{wrap(node.lhs, _PRECEDENCE[Iff])} <-> {wrap(node.rhs, _PRECEDENCE[Implies])}"
