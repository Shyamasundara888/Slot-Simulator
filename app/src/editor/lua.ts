// Evidenziazione del Lua e righe degli errori: niente DOM, così si prova con vitest.

export type TokenKind = "keyword" | "builtin" | "hook" | "string" | "number" | "comment" | "text";
export interface Token {
  kind: TokenKind;
  text: string;
}

const KEYWORDS = new Set([
  "and", "break", "do", "else", "elseif", "end", "false", "for", "function", "goto", "if", "in",
  "local", "nil", "not", "or", "repeat", "return", "then", "true", "until", "while",
]);
/** Nomi che il motore legge o mette a disposizione dello script. */
const HOOKS = new Set(["onSpin", "onFeatureEnd", "spinModes", "round"]);
const BUILTINS = new Set([
  "math", "string", "table", "utf8", "assert", "error", "ipairs", "next", "pairs", "pcall", "print",
  "rawequal", "rawget", "rawlen", "rawset", "select", "setmetatable", "getmetatable", "tonumber", "tostring", "type", "xpcall",
]);

/** Fine di una stringa o di un commento lunghi `[[ ]]` / `[==[ ]==]`; -1 se non è una parentesi lunga. */
function longBracket(source: string, start: number): number {
  const open = /^\[(=*)\[/.exec(source.slice(start, start + 64));
  if (!open) return -1;
  const close = `]${open[1]}]`;
  const end = source.indexOf(close, start + open[0].length);
  return end === -1 ? source.length : end + close.length;
}

/** Divide il sorgente in pezzi da colorare. Il testo dei pezzi, unito, è il sorgente. */
export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  const push = (kind: TokenKind, text: string) => {
    const last = tokens.at(-1);
    if (last && last.kind === kind && kind === "text") last.text += text;
    else tokens.push({ kind, text });
  };
  let i = 0;
  while (i < source.length) {
    const c = source[i]!;
    if (source.startsWith("--", i)) {
      const long = longBracket(source, i + 2);
      const end = long !== -1 ? long : source.indexOf("\n", i) === -1 ? source.length : source.indexOf("\n", i);
      push("comment", source.slice(i, end));
      i = end;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < source.length && source[j] !== c && source[j] !== "\n") j += source[j] === "\\" ? 2 : 1;
      j = Math.min(j + 1, source.length);
      push("string", source.slice(i, j));
      i = j;
    } else if (c === "[" && longBracket(source, i) !== -1) {
      const end = longBracket(source, i);
      push("string", source.slice(i, end));
      i = end;
    } else if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(source[i + 1] ?? ""))) {
      const match = /^(0[xX][0-9a-fA-F.]+([pP][+-]?\d+)?|\d*\.?\d+([eE][+-]?\d+)?)/.exec(source.slice(i))!;
      push("number", match[0]);
      i += match[0].length;
    } else if (/[A-Za-z_]/.test(c)) {
      const word = /^[A-Za-z_]\w*/.exec(source.slice(i))![0];
      // Un nome dopo un punto o due punti è un campo, non una parola chiave o una libreria.
      const before = source[i - 1];
      const field = (before === "." && source[i - 2] !== ".") || before === ":";
      push(field ? "text" : KEYWORDS.has(word) ? "keyword" : HOOKS.has(word) ? "hook" : BUILTINS.has(word) ? "builtin" : "text", word);
      i += word.length;
    } else {
      push("text", c);
      i++;
    }
  }
  return tokens;
}

/** I pezzi divisi per riga: una riga per ogni "\n" più l'ultima. */
export function tokenLines(source: string): Token[][] {
  const lines: Token[][] = [[]];
  for (const token of tokenize(source)) {
    const parts = token.text.split("\n");
    parts.forEach((part, index) => {
      if (index > 0) lines.push([]);
      if (part) lines.at(-1)!.push({ kind: token.kind, text: part });
    });
  }
  return lines;
}

export interface LineError {
  /** Riga, da 1. */
  line: number;
  message: string;
}

/** Righe citate dai messaggi d'errore dello script, come "scripts/main.lua:12: ...". */
export function errorLines(messages: readonly string[], file = "scripts/main.lua"): LineError[] {
  const pattern = new RegExp(`${file.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}:(\\d+): (.*)`);
  const found: LineError[] = [];
  for (const message of messages) {
    const match = pattern.exec(message);
    if (match) found.push({ line: Number(match[1]), message: match[2]! });
  }
  return found;
}

/** Rientro per la riga dopo un a capo: quello della riga, più due spazi dopo un'apertura di blocco. */
export function nextIndent(line: string): string {
  const indent = /^\s*/.exec(line)![0];
  const code = line.replace(/--.*$/, "").trim();
  const opens = /(\bthen|\bdo|\belse|\brepeat|\bfunction\b.*\)|\{)$/.test(code) && !/\bend$/.test(code);
  return opens ? `${indent}  ` : indent;
}
