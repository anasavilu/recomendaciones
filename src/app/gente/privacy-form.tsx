"use client";

import { useActionState } from "react";
import { updatePrivacy, type PrivacyState } from "./actions";

export function PrivacyForm({ isPublic, shows }: { isPublic: boolean; shows: "todo" | "recomendados" }) {
  const [state, action, pending] = useActionState<PrivacyState, FormData>(updatePrivacy, {});
  const opt = "flex items-start gap-3 rounded-lg border border-rule px-3 py-3 has-[:checked]:border-ink";
  return (
    <form action={action} className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm text-ink-soft">Quién puede ver tu lista</legend>
        <label className={opt}>
          <input type="radio" name="visibility" value="publico" defaultChecked={isPublic} className="mt-1" />
          <span>
            <strong className="font-semibold">Público</strong>
            <span className="block text-sm text-ink-soft">Cualquier persona con cuenta en Recomendados.</span>
          </span>
        </label>
        <label className={opt}>
          <input type="radio" name="visibility" value="privado" defaultChecked={!isPublic} className="mt-1" />
          <span>
            <strong className="font-semibold">Privado</strong>
            <span className="block text-sm text-ink-soft">Solo las personas que aceptes cuando te pidan seguirte.</span>
          </span>
        </label>
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm text-ink-soft">Qué ven</legend>
        <label className={opt}>
          <input type="radio" name="shows" value="todo" defaultChecked={shows === "todo"} className="mt-1" />
          <span>
            <strong className="font-semibold">Toda mi lista</strong>
            <span className="block text-sm text-ink-soft">Pendientes y realizados, con tu 👍 o 👎.</span>
          </span>
        </label>
        <label className={opt}>
          <input type="radio" name="shows" value="recomendados" defaultChecked={shows === "recomendados"} className="mt-1" />
          <span>
            <strong className="font-semibold">Solo lo que recomiendo</strong>
            <span className="block text-sm text-ink-soft">Lo realizado a lo que has dado 👍.</span>
          </span>
        </label>
      </fieldset>
      <p className="text-sm text-ink-soft">Tus notas, etiquetas y quién te recomendó cada cosa no los ve nadie.</p>
      <div className="flex items-center gap-4">
        <button disabled={pending} className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper disabled:opacity-60">
          {pending ? "Guardando…" : "Guardar privacidad"}
        </button>
        {state.ok && <span role="status" className="text-sm text-ink-soft">{state.ok}</span>}
        {state.error && <span role="alert" className="text-sm text-stamp">{state.error}</span>}
      </div>
    </form>
  );
}
