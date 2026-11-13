"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };

const STORAGE_KEY = "recomendados:asistente";
const SUGGESTIONS = [
  "¿Qué tengo pendiente para ver este finde?",
  "¿Quién me recomienda más cosas?",
  "De lo que he marcado con 👍, ¿qué podría recomendar a mi madre?",
];

function load(): Msg[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Msg[]) : [];
  } catch {
    return [];
  }
}

/** Cabecera de la lista con el botón «Pregúntame» y el recuadro de chat. */
export function HomeHeader() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      if (messages.length) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-20)));
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* sin almacenamiento: la conversación vive solo en esta pantalla */
    }
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages]);
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    const history: Msg[] = [...messages, { role: "user", content: q }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setText("");
    setError(null);
    setBusy(true);
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const msg = (await res.text().catch(() => "")) || "No he podido responder. Prueba otra vez.";
        setMessages(history);
        setError(msg);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let answer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        answer += decoder.decode(value, { stream: true });
        setMessages([...history, { role: "assistant", content: answer }]);
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setMessages(history);
        setError("No he podido responder. Revisa la conexión y prueba otra vez.");
      }
    } finally {
      setBusy(false);
      abort.current = null;
    }
  }

  function reset() {
    abort.current?.abort();
    setMessages([]);
    setError(null);
    setBusy(false);
    input.current?.focus();
  }

  return (
    <>
      <header className="flex items-center justify-between gap-2 pt-6 pb-4">
        <h1 className="min-w-0 truncate text-xl font-semibold tracking-tight sm:text-2xl">Recomendados</h1>
        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={() => {
              // La conversación se recuerda mientras la pestaña siga abierta (al ir a una ficha y volver)
              if (!open && messages.length === 0) setMessages(load());
              setOpen(!open);
            }}
            aria-expanded={open}
            aria-controls="asistente"
            className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-[0.8125rem] sm:px-3 sm:text-sm ${open ? "border-stamp bg-stamp text-stamp-ink" : "border-stamp text-stamp"}`}
          >
            Pregúntame
          </button>
          <Link href="/cuenta" className="whitespace-nowrap text-sm text-ink-soft underline-offset-4 hover:underline">
            Mi cuenta
          </Link>
        </div>
      </header>

      {open && (
        <section id="asistente" aria-label="Asistente" className="mb-5 flex flex-col gap-3 rounded-xl border border-rule bg-sheet p-3">
          {messages.length > 0 ? (
            <div ref={scroller} className="flex max-h-80 flex-col gap-3 overflow-y-auto" aria-live="polite">
              {messages.map((m, i) =>
                m.role === "user" ? (
                  <p key={i} className="max-w-[85%] self-end rounded-2xl rounded-br-sm bg-ink px-3 py-2 text-sm text-paper">
                    {m.content}
                  </p>
                ) : (
                  <p key={i} className="max-w-[92%] whitespace-pre-wrap text-[0.9375rem] leading-relaxed">
                    {m.content || <span className="text-ink-soft">Pensando…</span>}
                  </p>
                ),
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-ink-soft">Pregúntame lo que quieras sobre tu lista.</p>
              <ul className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <li key={s}>
                    <button
                      type="button"
                      onClick={() => ask(s)}
                      className="rounded-full border border-rule px-3 py-1 text-left text-[0.8125rem]"
                    >
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm text-stamp">
              {error}
            </p>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void ask(text);
            }}
            className="flex items-end gap-2"
          >
            <label htmlFor="pregunta" className="sr-only">
              Tu pregunta
            </label>
            <textarea
              id="pregunta"
              ref={input}
              rows={1}
              value={text}
              maxLength={1500}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void ask(text);
                }
              }}
              placeholder="Escribe tu pregunta…"
              className="max-h-32 min-h-10 flex-1 resize-none rounded-lg border border-rule bg-paper px-3 py-2 text-base"
            />
            <button
              disabled={busy || !text.trim()}
              className="h-10 shrink-0 rounded-full bg-stamp px-4 text-sm font-semibold text-stamp-ink disabled:opacity-50"
            >
              {busy ? "…" : "Enviar"}
            </button>
          </form>

          {messages.length > 0 && (
            <div className="flex items-center justify-between gap-3 text-xs text-ink-soft">
              <button type="button" onClick={reset} className="whitespace-nowrap underline underline-offset-4">
                Nueva conversación
              </button>
              <span className="text-right">Puede equivocarse.</span>
            </div>
          )}
        </section>
      )}
    </>
  );
}
