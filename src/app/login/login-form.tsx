"use client";

import { useActionState } from "react";
import { sendMagicLink, type LoginState } from "./actions";

export function LoginForm({ linkError }: { linkError: boolean }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(sendMagicLink, {});

  if (state.sent) {
    return (
      <p className="text-lg leading-relaxed">
        Te hemos enviado un enlace a <strong>{state.sent}</strong>. Ábrelo desde este mismo dispositivo para entrar.
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-5">
      {linkError && (
        <p role="alert" className="text-stamp">
          Ese enlace ya no vale. Pide uno nuevo.
        </p>
      )}
      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-ink-soft">Tu correo</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="rounded-lg border border-rule bg-sheet px-3 py-2.5 text-base"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-ink-soft">Tu nombre, para que se sepa cuándo recomiendas tú</span>
        <input
          name="name"
          autoComplete="given-name"
          placeholder="Ana"
          className="rounded-lg border border-rule bg-sheet px-3 py-2.5 text-base"
        />
      </label>
      {state.error && (
        <p role="alert" className="text-stamp">
          {state.error}
        </p>
      )}
      <button
        disabled={pending}
        className="rounded-full bg-stamp px-5 py-3 font-semibold text-stamp-ink disabled:opacity-60"
      >
        {pending ? "Enviando…" : "Enviarme el enlace"}
      </button>
    </form>
  );
}
