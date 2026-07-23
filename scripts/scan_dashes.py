#!/usr/bin/env python3
"""Scan for em/en dashes (— –) in USER-FACING text only.

Python: string literals, excluding docstrings and comments.
TS/TSX: code, excluding // line comments and /* */ (and {/* */}) block comments.

Code comments and docstrings are ignored on purpose — users never see them. Exit 1 if any hit is
found. Doubles as the pre-commit / CI guardrail for the no-em-dashes house rule.

Usage: python scripts/scan_dashes.py
"""
from __future__ import annotations

import ast
import io
import re
import sys
import tokenize
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DASHES = ("—", "–")  # em dash, en dash
PY_ROOTS = [ROOT / "backend" / "app"]
TS_ROOTS = [ROOT / "frontend" / "src"]
PY_EXCLUDE_NAMES = {"seed.py", "checks.py"}   # legacy dead seed; dev-only consistency-gate CLI output
EXCLUDE_DIRS = {"alembic", "node_modules", "dist", "__pycache__", ".git"}


def _has_dash(s: str) -> bool:
    return any(d in s for d in DASHES)


def _skip(path: Path) -> bool:
    return any(part in EXCLUDE_DIRS for part in path.parts)


def _allowed(src_lines: list[str], ln: int) -> bool:
    """A line marked `dash-ok` holds an intentional dash literal in non-user-facing code
    (e.g. the AI output sanitizer, which must reference the em/en dash to strip it)."""
    return 1 <= ln <= len(src_lines) and "dash-ok" in src_lines[ln - 1]


def scan_py(path: Path) -> list[tuple[int, str]]:
    src = path.read_text(encoding="utf-8")
    src_lines = src.splitlines()
    try:
        tree = ast.parse(src)
    except SyntaxError:
        return []
    doc_lines: set[int] = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            body = getattr(node, "body", None)
            if (body and isinstance(body[0], ast.Expr) and isinstance(body[0].value, ast.Constant)
                    and isinstance(body[0].value.value, str)):
                c = body[0].value
                for ln in range(c.lineno, (c.end_lineno or c.lineno) + 1):
                    doc_lines.add(ln)
    hits: list[tuple[int, str]] = []
    string_types = {tokenize.STRING}
    if hasattr(tokenize, "FSTRING_MIDDLE"):
        string_types.add(tokenize.FSTRING_MIDDLE)
    try:
        for tok in tokenize.generate_tokens(io.StringIO(src).readline):
            if (tok.type in string_types and _has_dash(tok.string)
                    and tok.start[0] not in doc_lines and not _allowed(src_lines, tok.start[0])):
                hits.append((tok.start[0], tok.string.strip().replace("\n", " ")[:110]))
    except (tokenize.TokenError, IndentationError):
        pass
    return hits


def strip_ts_comments(src: str) -> str:
    # Block comments (also covers JSX {/* */}); blank them but preserve newlines for line numbers.
    src = re.sub(r"/\*.*?\*/", lambda m: re.sub(r"[^\n]", " ", m.group()), src, flags=re.S)
    out = []
    for line in src.split("\n"):
        # Strip whole-line and trailing // comments. Require start-of-line or whitespace before //
        # so we never corrupt "https://" (colon before //, no space) inside a string.
        out.append(re.sub(r"(^|\s)//.*$", r"\1", line))
    return "\n".join(out)


def scan_ts(path: Path) -> list[tuple[int, str]]:
    raw = path.read_text(encoding="utf-8").split("\n")
    lines = strip_ts_comments("\n".join(raw)).split("\n")
    return [(i, line.strip()[:110]) for i, line in enumerate(lines, 1)
            if _has_dash(line) and not _allowed(raw, i)]


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # Windows console is cp1252
    except AttributeError:
        pass
    total = 0
    for roots, ext, scanner in ((PY_ROOTS, "*.py", scan_py), (TS_ROOTS, "*.tsx", scan_ts),
                                (TS_ROOTS, "*.ts", scan_ts)):
        for root in roots:
            for path in sorted(root.rglob(ext)):
                if _skip(path) or path.name in PY_EXCLUDE_NAMES:
                    continue
                hits = scanner(path)
                if hits:
                    rel = path.relative_to(ROOT)
                    for ln, text in hits:
                        print(f"{rel}:{ln}: {text}")
                    total += len(hits)
    print(f"\n{total} user-facing em/en dash(es) found.")
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main())
