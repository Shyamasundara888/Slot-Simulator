import { h } from "./dom.js";
import { type LineError, nextIndent, tokenLines } from "./lua.js";

export interface CodeEditorOptions {
  label: string;
  /** Chiamata dopo una pausa nella scrittura o quando il campo perde il focus. */
  onChange(text: string): void;
  /** Attesa dopo l'ultimo tasto prima di onChange. */
  delay?: number;
}

/**
 * Campo per il codice Lua: una textarea trasparente sopra il testo colorato,
 * con i numeri di riga e le righe degli errori. Lo stesso elemento resta tra
 * un disegno e l'altro dell'editor, così cursore, scorrimento e annulla del
 * browser non si perdono.
 */
export class CodeEditor {
  readonly element: HTMLElement;
  private readonly textarea: HTMLTextAreaElement;
  private readonly view: HTMLElement;
  private readonly gutter: HTMLElement;
  private errors: LineError[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pending = false;
  private scroll = { top: 0, left: 0 };

  constructor(private readonly options: CodeEditorOptions) {
    this.textarea = h("textarea", {
      class: "ed-code-input", spellcheck: "false", autocapitalize: "off", autocomplete: "off", wrap: "off",
      "data-key": "script", "aria-label": options.label,
      oninput: () => this.edited(),
      onblur: () => this.flush(),
      onscroll: () => this.syncScroll(),
      onkeydown: (e: Event) => this.key(e as KeyboardEvent),
    });
    this.view = h("pre", { class: "ed-code-view", "aria-hidden": "true" });
    this.gutter = h("div", { class: "ed-code-gutter", "aria-hidden": "true" });
    this.element = h("div", { class: "ed-code" }, this.gutter, h("div", { class: "ed-code-area" }, this.view, this.textarea));
    this.paint();
  }

  get value(): string {
    return this.textarea.value;
  }

  /** Mette il testo della bozza, per esempio dopo un annulla; non tocca una modifica ancora da salvare. */
  setValue(text: string): void {
    if (this.pending || text === this.textarea.value) return;
    this.textarea.value = text;
    this.textarea.dataset.saved = text;
    this.paint();
  }

  setErrors(errors: LineError[]): void {
    if (JSON.stringify(errors) === JSON.stringify(this.errors)) return;
    this.errors = errors;
    this.paint();
  }

  /** Va subito a onChange con le modifiche in sospeso. */
  flush(): void {
    clearTimeout(this.timer);
    if (!this.pending) return;
    this.pending = false;
    this.textarea.dataset.saved = this.textarea.value;
    this.options.onChange(this.textarea.value);
  }

  /** Porta il cursore all'inizio della riga e la mostra. */
  goToLine(line: number): void {
    const lines = this.textarea.value.split("\n");
    const start = lines.slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0);
    this.textarea.focus();
    this.textarea.setSelectionRange(start, start + (lines[line - 1]?.length ?? 0));
    const height = parseFloat(getComputedStyle(this.textarea).lineHeight) || 20;
    this.textarea.scrollTop = Math.max(0, (line - 4) * height);
    this.syncScroll();
  }

  /** Inserisce del testo al cursore, con il rientro della riga. */
  insert(text: string): void {
    const { selectionStart, value } = this.textarea;
    const indent = /^[ \t]*/.exec(value.slice(value.lastIndexOf("\n", selectionStart - 1) + 1))![0];
    this.textarea.focus();
    this.type(text.replace(/\n/g, `\n${indent}`));
  }

  /** Va chiamata dopo che l'elemento è tornato nella pagina: riprende lo scorrimento. */
  attached(): void {
    this.textarea.scrollTop = this.scroll.top;
    this.textarea.scrollLeft = this.scroll.left;
    this.syncScroll();
  }

  dispose(): void {
    this.flush();
  }

  private edited(): void {
    this.pending = true;
    this.paint();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.options.delay ?? 700);
  }

  /** Scrive come se lo facesse l'utente, così l'annulla del browser funziona. */
  private type(text: string): void {
    if (!document.execCommand("insertText", false, text)) {
      this.textarea.setRangeText(text, this.textarea.selectionStart, this.textarea.selectionEnd, "end");
      this.edited();
    }
  }

  private key(e: KeyboardEvent): void {
    const ta = this.textarea;
    if (e.key === "Escape") {
      // Da qui Tab torna a spostare il focus.
      ta.blur();
    } else if (e.key === "Tab" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      if (!e.shiftKey) return this.type("  ");
      const lineStart = ta.value.lastIndexOf("\n", ta.selectionStart - 1) + 1;
      const spaces = /^ {1,2}/.exec(ta.value.slice(lineStart))?.[0].length ?? 0;
      if (spaces === 0) return;
      const caret = ta.selectionStart;
      ta.setSelectionRange(lineStart, lineStart + spaces);
      this.type("");
      ta.setSelectionRange(Math.max(lineStart, caret - spaces), Math.max(lineStart, caret - spaces));
    } else if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.isComposing) {
      e.preventDefault();
      const line = ta.value.slice(ta.value.lastIndexOf("\n", ta.selectionStart - 1) + 1, ta.selectionStart);
      this.type(`\n${nextIndent(line)}`);
    }
  }

  private syncScroll(): void {
    const { scrollTop, scrollLeft } = this.textarea;
    this.scroll = { top: scrollTop, left: scrollLeft };
    this.view.style.transform = `translate(${-scrollLeft}px, ${-scrollTop}px)`;
    this.gutter.style.transform = `translateY(${-scrollTop}px)`;
  }

  private paint(): void {
    const byLine = new Map<number, string[]>();
    for (const { line, message } of this.errors) byLine.set(line, [...(byLine.get(line) ?? []), message]);
    const lines = tokenLines(this.textarea.value);
    this.view.replaceChildren(
      ...lines.map((tokens, i) =>
        h(
          "div",
          { class: byLine.has(i + 1) ? "ed-code-line error" : "ed-code-line" },
          ...tokens.map((token) => (token.kind === "text" ? token.text : h("span", { class: `lua-${token.kind}` }, token.text))),
          // Una riga vuota deve avere comunque la sua altezza.
          tokens.length === 0 ? "​" : null,
        ),
      ),
    );
    this.gutter.replaceChildren(
      ...lines.map((_, i) => {
        const messages = byLine.get(i + 1);
        return h("div", messages ? { class: "error", title: messages.join("\n") } : {}, String(i + 1));
      }),
    );
  }
}
