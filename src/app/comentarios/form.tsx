"use client";

import { useActionState, useState } from "react";
import { sendFeedback, type FeedbackState } from "./actions";

export function FeedbackForm({ page }: { page: string }) {
  const [state, action, pending] = useActionState<FeedbackState, FormData>(sendFeedback, {});
  const [text, setText] = useState("");
  const [sentKey, setSentKey] = useState(0);

  if (state.ok && sentKey === 0) {
    return (
      <div role="status" className="flex flex-col items-start gap-4">
        <p className="rounded-lg bg-mustard-soft px-4 py-3">Gracias, lo hemos recibido.</p>
        <button
          type="button"
          onClick={() => {
            setText("");
            setSentKey(1);
          }}
          className="text-sm text-ink-soft underline underline-offset-4"
        >
          Enviar otro comentario
        </button>
      </div>
    );
  }

  return (
    <form
      action={(fd) => {
        setSentKey(0);
        return action(fd);
      }}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="page" value={page} />
      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-ink-soft">Tu comentario</span>
        <textarea
          name="message"
          rows={6}
          required
          maxLength={4000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Algo que no funciona, una idea, algo que echas en falta…"
          className="rounded-lg border border-rule bg-sheet px-3 py-2.5 text-base"
        />
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-stamp">
          {state.error}
        </p>
      )}
      <button
        disabled={pending || !text.trim()}
        className="self-start rounded-full bg-stamp px-6 py-3 font-semibold text-stamp-ink disabled:opacity-60"
      >
        {pending ? "Enviando…" : "Enviar comentario"}
      </button>
    </form>
  );
}
