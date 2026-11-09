"use client";

import { useActionState, useState } from "react";
import { requestPasswordReset, signIn, signUp, type AuthState } from "./actions";

type Mode = "entrar" | "registro" | "olvido";

const input = "rounded-lg border border-rule bg-sheet px-3 py-2.5 text-base";

export function LoginForm({ linkError }: { linkError: boolean }) {
  const [mode, setMode] = useState<Mode>("entrar");

  return (
    <div className="flex flex-col gap-6">
      {mode !== "olvido" && (
        <div role="tablist" className="grid grid-cols-2 overflow-hidden rounded-lg border border-rule text-sm">
          {(
            [
              ["entrar", "Entrar"],
              ["registro", "Crear cuenta"],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              role="tab"
              type="button"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`px-3 py-2.5 ${mode === m ? "bg-ink font-semibold text-paper" : "bg-sheet"}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {linkError && (
        <p role="alert" className="text-stamp">
          Ese enlace ya no vale. Vuelve a pedirlo.
        </p>
      )}
      {mode === "entrar" && <SignIn onForgot={() => setMode("olvido")} />}
      {mode === "registro" && <SignUp />}
      {mode === "olvido" && <Forgot onBack={() => setMode("entrar")} />}
    </div>
  );
}

function Messages({ state }: { state: AuthState }) {
  return (
    <>
      {state.error && (
        <p role="alert" className="text-stamp">
          {state.error}
        </p>
      )}
      {state.info && (
        <p role="status" className="rounded-lg bg-mustard-soft px-4 py-3">
          {state.info}
        </p>
      )}
    </>
  );
}

function Field({ label, hint, ...props }: { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm text-ink-soft">{label}</span>
      <input {...props} className={input} />
      {hint && <span className="text-xs text-ink-soft">{hint}</span>}
    </label>
  );
}

function Submit({ pending, children, busy }: { pending: boolean; children: string; busy: string }) {
  return (
    <button disabled={pending} className="rounded-full bg-stamp px-5 py-3 font-semibold text-stamp-ink disabled:opacity-60">
      {pending ? busy : children}
    </button>
  );
}

function SignIn({ onForgot }: { onForgot: () => void }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(signIn, {});
  return (
    <form action={action} className="flex flex-col gap-5">
      <Field
        label="Usuario o correo"
        name="identifier"
        required
        autoComplete="username"
        autoCapitalize="none"
        defaultValue={state.values?.identifier}
      />
      <Field label="Contraseña" name="password" type="password" required autoComplete="current-password" />
      <Messages state={state} />
      <Submit pending={pending} busy="Entrando…">
        Entrar
      </Submit>
      <button type="button" onClick={onForgot} className="self-start text-sm text-ink-soft underline underline-offset-4">
        He olvidado mi contraseña
      </button>
    </form>
  );
}

function SignUp() {
  const [state, action, pending] = useActionState<AuthState, FormData>(signUp, {});
  if (state.info) return <Messages state={state} />;
  return (
    <form action={action} className="flex flex-col gap-5">
      <Field label="Tu nombre" name="name" required autoComplete="given-name" placeholder="Ana" defaultValue={state.values?.name} />
      <Field
        label="Usuario"
        name="username"
        required
        autoComplete="off"
        autoCapitalize="none"
        placeholder="ana"
        hint="Así te encontrarán los demás para decir que la recomendación es tuya. Minúsculas, números, punto o guion bajo."
        defaultValue={state.values?.username}
      />
      <Field label="Correo" name="email" type="email" required autoComplete="email" defaultValue={state.values?.email} />
      <Field
        label="Contraseña"
        name="password"
        type="password"
        required
        minLength={8}
        autoComplete="new-password"
        hint="Al menos 8 caracteres."
      />
      <Messages state={state} />
      <Submit pending={pending} busy="Creando cuenta…">
        Crear cuenta
      </Submit>
    </form>
  );
}

function Forgot({ onBack }: { onBack: () => void }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(requestPasswordReset, {});
  return (
    <form action={action} className="flex flex-col gap-5">
      <h2 className="text-xl font-semibold">Elegir una contraseña nueva</h2>
      <p className="text-ink-soft">Te enviaremos un enlace al correo de tu cuenta.</p>
      {!state.info && (
        <>
          <Field label="Correo" name="email" type="email" required autoComplete="email" defaultValue={state.values?.email} />
          <Submit pending={pending} busy="Enviando…">
            Enviarme el enlace
          </Submit>
        </>
      )}
      <Messages state={state} />
      <button type="button" onClick={onBack} className="self-start text-sm text-ink-soft underline underline-offset-4">
        Volver a entrar
      </button>
    </form>
  );
}
