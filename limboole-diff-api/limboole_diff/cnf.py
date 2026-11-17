"""Tseitin encoding of Limboole ASTs into CNF over a shared PySAT variable pool.
Every subformula gets a literal whose value is equivalent to the subformula (full Tseitin, both directions).  
The definitions alone are satisfiable for any assignment of the input variables, 
so all solvers built from one encoder can receive all definitions and differ only in the root units they assert.
"""
from pysat.formula import IDPool
from .parser import And, Iff, Implies, Node, Not, Or, Var, children

class Encoder:
    """Encode formulas over one variable pool; input variables keep their names."""

    def __init__(self) -> None:
        self.pool = IDPool()
        self.definitions: list[list[int]] = []
        self._literals: dict[int, int] = {}
        self._keep: list[Node] = []  # keeps encoded nodes alive, so their ids stay unique
        self._auxiliaries: int = 0

    def variable(self, name: str) -> int:
        return self.pool.id(("var", name))

    def literal(self, name: str, value: bool) -> int:
        identifier = self.variable(name)
        return identifier if value else -identifier

    def encode(self, root: Node) -> int:
        """Return a literal equivalent to ``root``, adding the needed definitions."""

        # Iterative post-order: deep formulas must not exhaust Python's recursion limit.
        pending: list[tuple[Node, bool]] = [(root, False)]
        while pending:
            node, expanded = pending.pop()
            if id(node) in self._literals:
                continue
            if isinstance(node, Var):
                self._store(node, self.variable(node.name))
                continue
            if not expanded:
                pending.append((node, True))
                pending.extend((child, False) for child in children(node) if id(child) not in self._literals)
                continue
            self._store(node, self._define(node))
        return self._literals[id(root)]

    def _store(self, node: Node, literal: int) -> None:
        self._literals[id(node)] = literal
        self._keep.append(node)

    def _fresh(self) -> int:
        self._auxiliaries += 1
        return self.pool.id(("aux", self._auxiliaries))

    def _define(self, node: Node) -> int:
        if isinstance(node, Not):
            return -self._literals[id(node.arg)]
        if isinstance(node, (And, Or)):
            args = [self._literals[id(arg)] for arg in node.args]
            out = self._fresh()
            if isinstance(node, And):
                self.definitions.extend([-out, arg] for arg in args)
                self.definitions.append([out] + [-arg for arg in args])
            else:
                self.definitions.extend([out, -arg] for arg in args)
                self.definitions.append([-out] + args)
            return out
        assert isinstance(node, (Implies, Iff))
        lhs, rhs = self._literals[id(node.lhs)], self._literals[id(node.rhs)]
        out = self._fresh()
        if isinstance(node, Implies):
            self.definitions += [[-out, -lhs, rhs], [out, lhs], [out, -rhs]]
        else:
            self.definitions += [[-out, -lhs, rhs], [-out, lhs, -rhs], [out, lhs, rhs], [out, -lhs, -rhs]]
        return out
