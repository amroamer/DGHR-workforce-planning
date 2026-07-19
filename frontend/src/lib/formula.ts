// Client-side evaluation of the formulas held in calc_methods — mirrors backend services/formula.py.
//
// The stepper needs a Required-FTE that updates as you type; a round-trip per keystroke would make
// it feel broken. So the arithmetic runs here — but the FORMULA does not live here. It arrives from
// /api/planning/method/registry, i.e. the same rows the server evaluates. What is duplicated is the
// evaluator (~60 lines of arithmetic), not the method.
//
// That distinction is the whole point. The previous version hardcoded `1600`, `Math.ceil` and each
// family's expression in TypeScript, so an admin changing a standard in the DB would leave the
// stepper quietly showing a different number from the one the server stored and the trace explained.
//
// Grammar (deliberately tiny, same as the backend): numbers, names, + − × ÷ ^, unary minus, parens,
// and min/max/ceil/floor/round. No eval(), no new Function() — an expression can do arithmetic and
// nothing else.

type Tok = { t: "num"; v: number } | { t: "name"; v: string } | { t: "op"; v: string };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\n") { i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9._]/.test(src[j])) j++;
      out.push({ t: "num", v: Number(src.slice(i, j).replace(/_/g, "")) });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      out.push({ t: "name", v: src.slice(i, j) });
      i = j;
      continue;
    }
    if ("+-*/^(),".includes(c)) { out.push({ t: "op", v: c }); i++; continue; }
    throw new Error(`Unexpected character '${c}' in formula`);
  }
  return out;
}

const FUNCS: Record<string, (...a: number[]) => number> = {
  min: Math.min,
  max: Math.max,
  ceil: (x) => Math.ceil(x - 1e-9),
  floor: (x) => Math.floor(x + 1e-9),
  round: (x) => halfUp(x),
};

/** Round half AWAY from zero — matches the backend's _half_up, not JS's Math.round (which rounds
 *  −0.5 to −0, i.e. half-up toward +∞ and disagrees on negatives). */
export function halfUp(x: number): number {
  return x >= 0 ? Math.floor(x + 0.5) : -Math.floor(-x + 0.5);
}

class Parser {
  private i = 0;
  constructor(private toks: Tok[], private vars: Record<string, number>) {}

  private peek(): Tok | undefined { return this.toks[this.i]; }
  private eat(v: string): boolean {
    const t = this.peek();
    if (t && t.t === "op" && t.v === v) { this.i++; return true; }
    return false;
  }

  parse(): number {
    const v = this.expr();
    if (this.i < this.toks.length) throw new Error("Trailing tokens in formula");
    return v;
  }

  // + −
  private expr(): number {
    let v = this.term();
    for (;;) {
      if (this.eat("+")) v += this.term();
      else if (this.eat("-")) v -= this.term();
      else return v;
    }
  }

  // × ÷
  private term(): number {
    let v = this.power();
    for (;;) {
      if (this.eat("*")) v *= this.power();
      else if (this.eat("/")) {
        const d = this.power();
        if (d === 0) throw new Error("division by zero");
        v /= d;
      } else return v;
    }
  }

  // ^ (right-associative)
  private power(): number {
    const base = this.unary();
    if (this.eat("^")) return Math.pow(base, this.power());
    return base;
  }

  private unary(): number {
    if (this.eat("-")) return -this.unary();
    if (this.eat("+")) return this.unary();
    return this.atom();
  }

  private atom(): number {
    const t = this.peek();
    if (!t) throw new Error("Unexpected end of formula");
    if (t.t === "num") { this.i++; return t.v; }
    if (t.t === "name") {
      this.i++;
      if (this.eat("(")) {
        const fn = FUNCS[t.v];
        if (!fn) throw new Error(`Unknown function '${t.v}'`);
        const args: number[] = [];
        if (!this.eat(")")) {
          do { args.push(this.expr()); } while (this.eat(","));
          if (!this.eat(")")) throw new Error("Expected ')'");
        }
        return fn(...args);
      }
      if (!(t.v in this.vars)) throw new Error(`Unknown variable '${t.v}'`);
      return this.vars[t.v];
    }
    if (this.eat("(")) {
      const v = this.expr();
      if (!this.eat(")")) throw new Error("Expected ')'");
      return v;
    }
    throw new Error("Malformed formula");
  }
}

/** Evaluate `expression` over `vars`. Throws rather than returning a wrong number — a silent 0 is
 *  indistinguishable from a real zero on screen. */
export function evaluate(expression: string, vars: Record<string, number>): number {
  return new Parser(tokenize(expression), vars).parse();
}

/** Same rules, same names as the backend's apply_rounding. */
export function applyRounding(rule: string, value: number): number {
  if (rule === "ceil") return Math.ceil(value - 1e-9);
  if (rule === "floor") return Math.floor(value + 1e-9);
  if (rule === "round_half_up") return halfUp(value);
  if (rule === "round_half_even") {
    const r = Math.round(value);
    return Math.abs(value % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
  }
  return value;
}

/** Render the symbolic form for display: "volume * team_size" → "volume × team size". */
export function renderExpression(expression: string): string {
  return expression
    .replace(/\*/g, "×")
    .replace(/\//g, "÷")
    .replace(/\b([a-z_]+)\b/gi, (w) => (w in FUNCS ? w : w.replace(/_/g, " ")));
}
