"""Safe evaluation + human rendering of the formulas held in `calc_methods.expression`.

The point of keeping formulas in the DB is that the formula a user is SHOWN in "View calculation" is
the same string the engine actually evaluated — they cannot drift, because there is only one of them.
That only holds if we really evaluate it, so this module does, over a deliberately tiny grammar:

    numbers, named variables, + − × ÷ ^, unary minus, and min/max/ceil/floor/round

`eval()` is never used. The AST is whitelisted node-by-node, so an expression can do arithmetic and
nothing else — no attribute access, no calls beyond the four listed, no names beyond the ones passed.

Alongside the value it renders the SUBSTITUTED form ("7 × 6"), which is what makes a trace legible:
seeing `volume × team_size` explains the method, but seeing `7 × 6 = 42` explains the number.
"""

from __future__ import annotations

import ast
import math
import operator
from typing import Any, Callable

# (python op, display symbol, precedence)
_BINOPS: dict[type, tuple[Callable[[float, float], float], str, int]] = {
    ast.Add: (operator.add, "+", 1),
    ast.Sub: (operator.sub, "−", 1),
    ast.Mult: (operator.mul, "×", 2),
    ast.Div: (operator.truediv, "÷", 2),
    ast.Pow: (operator.pow, "^", 3),
}

_FUNCS: dict[str, Callable[..., float]] = {
    "min": min,
    "max": max,
    "ceil": lambda x: float(math.ceil(x - 1e-9)),
    "floor": lambda x: float(math.floor(x + 1e-9)),
    "round": lambda x: float(_half_up(x)),
}


class FormulaError(ValueError):
    """Raised when an expression is malformed, references an unknown name, or divides by zero."""


def _half_up(x: float) -> int:
    """Round half AWAY from zero — the arithmetic a person expects when told "rounded to a whole
    post". Python's built-in round() is half-to-EVEN (round(0.5) == 0), which is defensible in
    statistics but surprising in a document that has to be explained to a committee."""
    return int(math.floor(x + 0.5)) if x >= 0 else -int(math.floor(-x + 0.5))


def fmt_num(v: float) -> str:
    """Render a number the way the trace should read: no trailing .0, thousands separated."""
    if v is None:
        return "—"
    f = float(v)
    if f == int(f) and abs(f) < 1e15:
        return f"{int(f):,}"
    out = f"{f:,.4f}".rstrip("0").rstrip(".")
    return out or "0"


# ─────────────────────────── parsing ───────────────────────────
def _parse(expression: str) -> ast.expr:
    try:
        return ast.parse(expression.strip(), mode="eval").body
    except SyntaxError as exc:  # pragma: no cover - guarded by seed + checks
        raise FormulaError(f"cannot parse expression {expression!r}: {exc}") from exc


def variables_used(expression: str) -> list[str]:
    """Every variable the expression reads — drives the trace's parameter table, so an unused param
    is never shown as if it had influenced the result."""
    return sorted({n.id for n in ast.walk(_parse(expression)) if isinstance(n, ast.Name)})


# ─────────────────────────── evaluation ───────────────────────────
def _eval(node: ast.expr, vars_: dict[str, float]) -> float:
    if isinstance(node, ast.Constant):
        if isinstance(node.value, bool) or not isinstance(node.value, (int, float)):
            raise FormulaError(f"only numeric literals are allowed, got {node.value!r}")
        return float(node.value)

    if isinstance(node, ast.Name):
        if node.id not in vars_:
            raise FormulaError(f"unknown variable {node.id!r}")
        return float(vars_[node.id])

    if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
        v = _eval(node.operand, vars_)
        return -v if isinstance(node.op, ast.USub) else v

    if isinstance(node, ast.BinOp) and type(node.op) in _BINOPS:
        fn = _BINOPS[type(node.op)][0]
        left, right = _eval(node.left, vars_), _eval(node.right, vars_)
        if fn is operator.truediv and right == 0:
            # A zero denominator means a required parameter was never supplied (serving_ratio,
            # productive_hours…). Sizing treats that as "cannot size", not as infinity.
            raise FormulaError("division by zero")
        return float(fn(left, right))

    if isinstance(node, ast.Call):
        if not isinstance(node.func, ast.Name) or node.func.id not in _FUNCS:
            raise FormulaError("only min/max/ceil/floor/round may be called")
        if node.keywords:
            raise FormulaError("keyword arguments are not allowed")
        return float(_FUNCS[node.func.id](*[_eval(a, vars_) for a in node.args]))

    raise FormulaError(f"disallowed expression element: {type(node).__name__}")


def evaluate(expression: str, variables: dict[str, Any]) -> float:
    """Evaluate `expression` over `variables`. Raises FormulaError rather than returning a wrong
    number — a silent 0 would be indistinguishable from a real zero on screen."""
    clean = {k: float(v) for k, v in variables.items() if isinstance(v, (int, float))}
    return _eval(_parse(expression), clean)


# ─────────────────────────── rendering ───────────────────────────
def _render(node: ast.expr, vars_: dict[str, float] | None) -> tuple[str, int]:
    """(text, precedence). `vars_=None` renders the symbolic form; a dict substitutes values."""
    if isinstance(node, ast.Constant):
        return fmt_num(float(node.value)), 4

    if isinstance(node, ast.Name):
        if vars_ is None:
            return node.id.replace("_", " "), 4
        return (fmt_num(vars_[node.id]) if node.id in vars_ else node.id), 4

    if isinstance(node, ast.UnaryOp):
        txt, _ = _render(node.operand, vars_)
        return (f"−{txt}" if isinstance(node.op, ast.USub) else txt), 4

    if isinstance(node, ast.BinOp):
        _, sym, prec = _BINOPS[type(node.op)]
        lt, lp = _render(node.left, vars_)
        rt, rp = _render(node.right, vars_)
        if lp < prec:
            lt = f"({lt})"
        # Right operand of a non-associative op needs parens at EQUAL precedence too:
        # a ÷ (b × c) must never render as a ÷ b × c.
        if rp < prec or (rp == prec and isinstance(node.op, (ast.Sub, ast.Div))):
            rt = f"({rt})"
        return f"{lt} {sym} {rt}", prec

    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
        args = ", ".join(_render(a, vars_)[0] for a in node.args)
        return f"{node.func.id}({args})", 4

    return "?", 4


def render(expression: str, variables: dict[str, Any] | None = None) -> str:
    """Symbolic form when `variables` is None ("volume × team size"), substituted when given ("7 × 6")."""
    clean = None if variables is None else {k: float(v) for k, v in variables.items()
                                            if isinstance(v, (int, float))}
    return _render(_parse(expression), clean)[0]


# ─────────────────────────── rounding ───────────────────────────
ROUNDING_LABEL = {
    "ceil": "Rounded up to the next whole post",
    "floor": "Rounded down to a whole post",
    "round_half_up": "Rounded to the nearest whole post (halves up)",
    "round_half_even": "Rounded to the nearest whole post (halves to even)",
    "none": "Not rounded at this step",
}


def apply_rounding(rule: str, value: float) -> float:
    if rule == "ceil":
        return float(math.ceil(value - 1e-9))
    if rule == "floor":
        return float(math.floor(value + 1e-9))
    if rule == "round_half_up":
        return float(_half_up(value))
    if rule == "round_half_even":
        return float(round(value))
    return float(value)
