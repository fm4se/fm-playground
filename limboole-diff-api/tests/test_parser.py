import random
import pytest
from pysat.solvers import Solver

from limboole_diff.cnf import Encoder
from limboole_diff.limboole_executor import process_commands
from limboole_diff.parser import (
    And,
    Iff,
    Implies,
    LimbooleSyntaxError,
    Not,
    Or,
    Var,
    evaluate,
    parse,
    to_text,
    variables,
)


def limboole_status(text: str) -> str:
    output = process_commands(text)
    if output.startswith("% SATISFIABLE"):
        return "sat"
    if output.startswith("% UNSATISFIABLE"):
        return "unsat"
    return "error"


def python_status(text: str) -> str:
    try:
        node = parse(text)
    except LimbooleSyntaxError:
        return "error"
    encoder = Encoder()
    root = encoder.encode(node)
    with Solver(name="g4", bootstrap_with=encoder.definitions + [[root]]) as solver:
        return "sat" if solver.solve() else "unsat"


SYNTAX_CASES = [
    "a.b & c[1] & $x & @y & d-e & f_g & 9z",
    "a & b-",
    "a ->b",
    "a->b",
    "a-->b",
    "a -> b -> c",
    "a <-> b <-> c & !a & !b & c",
    "a <- b <- c",
    "a -> b <- c",
    "!(a | b -> c) & !a & b & c",
    "!(a & b | c) & c",
    "a <- b & !a & b",
    "~~a & -a",
    "--a & !a",
    "- a & a",
    "a & b-c & !b-c",
    "a<->b & !a",
    "a<-b",
    "a % comment\n& !a",
    "x & y % trailing",
    "",
    "a &",
    "a b",
    "(a",
    "a)",
    "a < b",
    "a > b",
    "a ^ b",
    "#a",
    "a, b",
    "((a)) & (b)",
    "(a -> b) -> c",
    "a <-> b -> c & a & !c & b",
    "a | b <- c",
]


@pytest.mark.parametrize("text", SYNTAX_CASES)
def test_parser_matches_limboole(text: str) -> None:
    assert python_status(text) == limboole_status(text)


def random_formula(rng: random.Random, names: list[str], depth: int):
    if depth == 0 or rng.random() < 0.2:
        return Var(rng.choice(names))
    kind = rng.choice(["not", "and", "or", "implies", "iff"])
    if kind == "not":
        return Not(random_formula(rng, names, depth - 1))
    if kind in ("and", "or"):
        args = tuple(random_formula(rng, names, depth - 1) for _ in range(rng.randint(2, 3)))
        return And(args) if kind == "and" else Or(args)
    lhs, rhs = random_formula(rng, names, depth - 1), random_formula(rng, names, depth - 1)
    return Implies(lhs, rhs) if kind == "implies" else Iff(lhs, rhs)


def test_printed_random_formulas_match_limboole() -> None:
    rng = random.Random(7)
    names = ["a", "b", "c", "x.1", "y-z"]
    for _ in range(60):
        text = to_text(random_formula(rng, names, 4))
        assert python_status(text) == limboole_status(text), text


def test_to_text_round_trip_preserves_semantics() -> None:
    rng = random.Random(11)
    names = ["a", "b", "c", "d"]
    for _ in range(200):
        node = random_formula(rng, names, 4)
        reparsed = parse(to_text(node))
        for bits in range(16):
            assignment = {name: bool(bits >> index & 1) for index, name in enumerate(names)}
            assignment = {name: assignment[name] for name in variables(node)}
            assert evaluate(node, assignment) == evaluate(reparsed, assignment)


def test_precedence() -> None:
    node = parse("a | b & !c -> d <-> e")
    assert isinstance(node, Iff)
    assert isinstance(node.lhs, Implies)
    assert isinstance(node.lhs.lhs, Or)
    assert isinstance(node.lhs.lhs.args[1], And)
    assert isinstance(parse("a <- b"), Implies) and parse("a <- b").lhs.name == "b"


def test_deep_nesting_does_not_crash() -> None:
    text = "(" * 5000 + "a" + ")" * 5000
    try:
        parse(text)
    except LimbooleSyntaxError:
        pass
