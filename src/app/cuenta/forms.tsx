"use client";

import { useActionState } from "react";
import { changePassword, updateProfile, type FormState } from "./actions";

const input = "rounded-lg border border-rule bg-sheet px-3 py-2.5 text-base";

function Result({ state }: { state: FormState }) {
  if (state.error)
    return (
      <p role="alert" className="text-sm text-stamp">
        {state.error}
      </p>
    );
  if (state.ok)
    return (
      <p role="status" className="text-sm text-ink-soft">
        {state.ok}
      </p>
    );
  return null;
}

export function ProfileForm({ name, username }: { name: string; username: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateProfile, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-ink-soft">Usuario</span>
        <input name="username" required defaultValue={username} autoCapitalize="none" placeholder="ana" className={input} />
        <span className="text-xs text-ink-soft">
          Compártelo para que, cuando alguien apunte algo que le recomendaste, ponga que viene de ti.
        </span>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-ink-soft">Tu nombre</span>
        <input name="name" required defaultValue={name} className={input} />
      </label>
      <Result state={state} />
      <button disabled={pending} className="self-start rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper disabled:opacity-60">
        {pending ? "Guardando…" : "Guardar datos"}
      </button>
    </form>
  );
}

export function PasswordForm({ highlight }: { highlight: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(changePassword, {});
  return (
    <form action={action} id="contrasena" className="flex flex-col gap-4">
      {highlight && !state.ok && (
        <p role="status" className="rounded-lg bg-mustard-soft px-4 py-3 text-sm">
          Elige tu contraseña nueva.
        </p>
      )}
      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-ink-soft">Contraseña nueva</span>
        <input name="password" type="password" required minLength={8} autoComplete="new-password" autoFocus={highlight} className={input} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-ink-soft">Repítela</span>
        <input name="repeat" type="password" required minLength={8} autoComplete="new-password" className={input} />
      </label>
      <Result state={state} />
      <button disabled={pending} className="self-start rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper disabled:opacity-60">
        {pending ? "Cambiando…" : "Cambiar contraseña"}
      </button>
    </form>
  );
}
