"use client";

import { useActionState, useEffect, useState } from "react";
import { sendFeedback, type FeedbackState } from "./actions";

/**
 * Recuadro de comentarios. `compact` es la versión mini del pie de la lista:
 * tras enviar, da las gracias y a los pocos segundos vuelve a quedar listo.
 */
export function FeedbackForm({ page, compact = false }: { page: string; compact?: boolean }) {
  const [state, action, pending] = useActionState<FeedbackState, FormData>(sendFeedback, {});
  const [text, setText] = useState("");
  const [thanks, setThanks] = useState(false);
  const [seen, setSeen] = useState(state);

  // Cada respuesta correcta nueva: vaciar el recuadro y dar las gracias
  if (state !== seen) {
    setSeen(state);
    if (state.ok) {
      setText("");
      setThanks(true);
    }
  }
  useEffect(() => {
    if (!thanks) return;
    const t = setTimeout(() => setThanks(false), 5000);
    return () => clearTimeout(t);
  }, [thanks]);

  return (
    <form action={action} className={`flex flex-col ${compact ? "gap-2" : "gap-4"}`}>
      <input type="hidden" name="page" value={page} />
      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-ink-soft">{compact ? "¿Algo que mejorar? Cuéntanoslo" : "Tu comentario"}</span>
        <textarea
          name="message"
          rows={compact ? 2 : 6}
          required
          maxLength={4000}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setThanks(false);
          }}
          placeholder="Algo que no funciona, una idea, algo que echas en falta…"
          className={`rounded-lg border border-rule bg-sheet px-3 py-2 ${compact ? "text-sm" : "text-base"}`}
        />
      </label>
      <div className="flex items-center gap-3">
        <button
          disabled={pending || !text.trim()}
          className={`rounded-full bg-ink font-semibold text-paper disabled:opacity-50 ${compact ? "px-4 py-1.5 text-sm" : "px-6 py-3"}`}
        >
          {pending ? "Enviando…" : compact ? "Enviar" : "Enviar comentario"}
        </button>
        {thanks && (
          <span role="status" className="text-sm text-ink-soft">
            Gracias, lo hemos recibido.
          </span>
        )}
        {state.error && !pending && (
          <span role="alert" className="text-sm text-stamp">
            {state.error}
          </span>
        )}
      </div>
    </form>
  );
}
