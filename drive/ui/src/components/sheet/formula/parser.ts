import type { Token } from "./tokenizer";
import type { Expr, BinaryOp } from "./ast";

export function parse(tokens: Token[]): Expr {
  const state = { tokens, pos: 0 };
  const expr = parseComparison(state);
  if (state.pos < tokens.length) {
    throw new Error(`unexpected token '${tokens[state.pos].value}'`);
  }
  return expr;
}

interface State { tokens: Token[]; pos: number; }

function peek(s: State): Token | undefined {
  return s.tokens[s.pos];
}

function consume(s: State): Token {
  const token = s.tokens[s.pos];
  if (!token) throw new Error("unexpected end of expression");
  s.pos += 1;
  return token;
}

function parseComparison(s: State): Expr {
  const left = parseAddSub(s);
  const op = peek(s);
  if (!op) return left;
  const map: Record<string, BinaryOp> = {
    EQ: "=", NEQ: "<>", LT: "<", GT: ">", LTE: "<=", GTE: ">=",
  };
  const mapped = map[op.kind];
  if (!mapped) return left;
  consume(s);
  const right = parseAddSub(s);
  return { kind: "binary", op: mapped, left, right };
}

function parseAddSub(s: State): Expr {
  let left = parseMulDiv(s);
  while (true) {
    const token = peek(s);
    if (!token) break;
    if (token.kind !== "PLUS" && token.kind !== "MINUS" && token.kind !== "AMP") break;
    consume(s);
    const right = parseMulDiv(s);
    const op: BinaryOp = token.kind === "PLUS" ? "+" : token.kind === "MINUS" ? "-" : "&";
    left = { kind: "binary", op, left, right };
  }
  return left;
}

function parseMulDiv(s: State): Expr {
  let left = parseUnary(s);
  while (true) {
    const token = peek(s);
    if (!token) break;
    if (token.kind !== "STAR" && token.kind !== "SLASH") break;
    consume(s);
    const right = parseUnary(s);
    const op: BinaryOp = token.kind === "STAR" ? "*" : "/";
    left = { kind: "binary", op, left, right };
  }
  return left;
}

function parseUnary(s: State): Expr {
  const token = peek(s);
  if (token && (token.kind === "PLUS" || token.kind === "MINUS")) {
    consume(s);
    const expr = parseUnary(s);
    return { kind: "unary", op: token.kind === "PLUS" ? "+" : "-", expr };
  }
  return parsePrimary(s);
}

function parsePrimary(s: State): Expr {
  const token = peek(s);
  if (!token) throw new Error("unexpected end of expression");

  if (token.kind === "NUMBER") {
    consume(s);
    return { kind: "num", value: Number(token.value) };
  }
  if (token.kind === "STRING") {
    consume(s);
    return { kind: "str", value: token.value };
  }
  if (token.kind === "RANGE") {
    consume(s);
    return { kind: "range", range: token.value };
  }
  if (token.kind === "REF") {
    consume(s);
    return { kind: "ref", ref: token.value };
  }
  if (token.kind === "IDENT") {
    if (token.value === "TRUE") { consume(s); return { kind: "bool", value: true }; }
    if (token.value === "FALSE") { consume(s); return { kind: "bool", value: false }; }
    consume(s);
    const lparen = peek(s);
    if (!lparen || lparen.kind !== "LPAREN") {
      throw new Error(`expected '(' after function name '${token.value}'`);
    }
    consume(s);
    const args: Expr[] = [];
    if (peek(s)?.kind !== "RPAREN") {
      args.push(parseComparison(s));
      while (peek(s)?.kind === "COMMA") {
        consume(s);
        args.push(parseComparison(s));
      }
    }
    const rparen = peek(s);
    if (!rparen || rparen.kind !== "RPAREN") throw new Error("missing ')'");
    consume(s);
    return { kind: "call", name: token.value, args };
  }
  if (token.kind === "LPAREN") {
    consume(s);
    const expr = parseComparison(s);
    const rparen = peek(s);
    if (!rparen || rparen.kind !== "RPAREN") throw new Error("missing ')'");
    consume(s);
    return expr;
  }

  throw new Error(`unexpected token '${token.value}'`);
}
