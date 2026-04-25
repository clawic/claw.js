export type TokenKind =
  | "NUMBER"
  | "STRING"
  | "IDENT"
  | "REF"
  | "RANGE"
  | "PLUS"
  | "MINUS"
  | "STAR"
  | "SLASH"
  | "LPAREN"
  | "RPAREN"
  | "COMMA"
  | "EQ"
  | "NEQ"
  | "LT"
  | "GT"
  | "LTE"
  | "GTE"
  | "PERCENT"
  | "AMP";

export interface Token {
  kind: TokenKind;
  value: string;
  start: number;
}

const REF_RE = /^[A-Z]+\d+$/;

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const src = input;

  while (i < src.length) {
    const ch = src[i];

    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i += 1;
      continue;
    }

    if (ch === "(") { tokens.push({ kind: "LPAREN", value: "(", start: i }); i += 1; continue; }
    if (ch === ")") { tokens.push({ kind: "RPAREN", value: ")", start: i }); i += 1; continue; }
    if (ch === ",") { tokens.push({ kind: "COMMA", value: ",", start: i }); i += 1; continue; }
    if (ch === "+") { tokens.push({ kind: "PLUS", value: "+", start: i }); i += 1; continue; }
    if (ch === "-") { tokens.push({ kind: "MINUS", value: "-", start: i }); i += 1; continue; }
    if (ch === "*") { tokens.push({ kind: "STAR", value: "*", start: i }); i += 1; continue; }
    if (ch === "/") { tokens.push({ kind: "SLASH", value: "/", start: i }); i += 1; continue; }
    if (ch === "%") { tokens.push({ kind: "PERCENT", value: "%", start: i }); i += 1; continue; }
    if (ch === "&") { tokens.push({ kind: "AMP", value: "&", start: i }); i += 1; continue; }

    if (ch === "<") {
      if (src[i + 1] === "=") { tokens.push({ kind: "LTE", value: "<=", start: i }); i += 2; continue; }
      if (src[i + 1] === ">") { tokens.push({ kind: "NEQ", value: "<>", start: i }); i += 2; continue; }
      tokens.push({ kind: "LT", value: "<", start: i }); i += 1; continue;
    }
    if (ch === ">") {
      if (src[i + 1] === "=") { tokens.push({ kind: "GTE", value: ">=", start: i }); i += 2; continue; }
      tokens.push({ kind: "GT", value: ">", start: i }); i += 1; continue;
    }
    if (ch === "=") { tokens.push({ kind: "EQ", value: "=", start: i }); i += 1; continue; }

    if (ch === "\"") {
      let j = i + 1;
      let value = "";
      while (j < src.length) {
        if (src[j] === "\"") {
          if (src[j + 1] === "\"") {
            value += "\"";
            j += 2;
            continue;
          }
          break;
        }
        value += src[j];
        j += 1;
      }
      if (j >= src.length) throw new Error("unterminated string literal");
      tokens.push({ kind: "STRING", value, start: i });
      i = j + 1;
      continue;
    }

    if (ch >= "0" && ch <= "9") {
      let j = i;
      while (j < src.length && src[j] >= "0" && src[j] <= "9") j += 1;
      if (src[j] === ".") {
        j += 1;
        while (j < src.length && src[j] >= "0" && src[j] <= "9") j += 1;
      }
      tokens.push({ kind: "NUMBER", value: src.slice(i, j), start: i });
      i = j;
      continue;
    }

    if ((ch >= "A" && ch <= "Z") || (ch >= "a" && ch <= "z") || ch === "_") {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j += 1;
      const word = src.slice(i, j);
      const upper = word.toUpperCase();

      if (REF_RE.test(upper)) {
        if (src[j] === ":" && /[A-Z]/i.test(src[j + 1] ?? "")) {
          let k = j + 1;
          while (k < src.length && /[A-Za-z0-9_]/.test(src[k])) k += 1;
          const second = src.slice(j + 1, k).toUpperCase();
          if (REF_RE.test(second)) {
            tokens.push({ kind: "RANGE", value: `${upper}:${second}`, start: i });
            i = k;
            continue;
          }
        }
        tokens.push({ kind: "REF", value: upper, start: i });
        i = j;
        continue;
      }

      tokens.push({ kind: "IDENT", value: upper, start: i });
      i = j;
      continue;
    }

    throw new Error(`unexpected character '${ch}' at position ${i}`);
  }

  return tokens;
}
