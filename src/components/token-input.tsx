"use client";

import { useEffect, useId, useState } from "react";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Valor del campo. En personas, `token` es "@usuario" si es alguien de la app o el nombre libre si no. */
export type Token = { token: string; name: string; username?: string | null };

/**
 * Lista de valores (etiquetas o personas) con sugerencias.
 * Se envía en el formulario como un campo oculto separado por comas.
 * En personas, además busca usuarios de la app mientras escribes.
 */
export function TokenInput({
  name,
  label,
  hint,
  initial = [],
  suggestions,
  variant,
  placeholder,
}: {
  name: string;
  label: string;
  hint?: string;
  initial?: Token[];
  suggestions: Token[];
  variant: "tag" | "person";
  placeholder?: string;
}) {
  const id = useId();
  const [values, setValues] = useState<Token[]>(initial);
  const [text, setText] = useState("");
  const [users, setUsers] = useState<{ q: string; results: Token[] }>({ q: "", results: [] });

  const q = text.trim();
  const lookingForUsers = variant === "person" && q.replace(/^@/, "").length >= 2;

  useEffect(() => {
    if (!lookingForUsers) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/profiles/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        const data = await res.json();
        setUsers({ q, results: data.results ?? [] });
      } catch {
        /* sin sugerencias de usuarios */
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [lookingForUsers, q]);

  const has = (tok: string) => values.some((x) => norm(x.token) === norm(tok));
  const add = (v: Token) => {
    if (!has(v.token)) setValues((xs) => [...xs, v]);
    setText("");
  };
  const addText = (raw: string) => {
    const v = raw.replace(/,/g, " ").trim().replace(/\s+/g, " ");
    if (v) add({ token: v, name: v.replace(/^@/, "") });
    else setText("");
  };
  const remove = (tok: string) => setValues((xs) => xs.filter((x) => x.token !== tok));

  const nq = norm(q.replace(/^@/, ""));
  const userHits = lookingForUsers && users.q === q ? users.results.filter((u) => !has(u.token)) : [];
  const local = suggestions
    .filter((s) => !has(s.token) && !userHits.some((u) => u.token === s.token))
    .filter((s) => !nq || norm(s.name).includes(nq) || (s.username ?? "").includes(nq))
    .slice(0, 8);

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm text-ink-soft">
        {label}
      </label>
      <input type="hidden" name={name} value={values.map((v) => v.token).join(",")} />
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-rule bg-sheet px-3 py-2">
        {values.map((v) => (
          <button
            type="button"
            key={v.token}
            onClick={() => remove(v.token)}
            className={`inline-flex items-center gap-1 ${variant === "person" ? "" : "rounded bg-mustard-soft px-2 py-0.5 text-sm"}`}
            aria-label={`Quitar ${v.name}`}
          >
            {variant === "person" ? <PersonLabel p={v} /> : v.name}
            <span aria-hidden className="text-sm text-ink-soft">×</span>
          </button>
        ))}
        <input
          id={id}
          value={text}
          onChange={(e) => {
            const v = e.target.value;
            if (v.endsWith(",")) addText(v.slice(0, -1));
            else setText(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              // Si lo escrito coincide exactamente con un usuario, se elige ese usuario
              const exact = userHits.find((u) => u.username === nq);
              if (exact) add(exact);
              else if (q) addText(q);
            } else if (e.key === "Backspace" && !text && values.length) {
              setValues((xs) => xs.slice(0, -1));
            }
          }}
          onBlur={() => q && addText(q)}
          placeholder={values.length ? "" : placeholder}
          className="min-w-32 flex-1 bg-transparent py-1 text-base outline-none"
          enterKeyHint="done"
          autoComplete="off"
        />
      </div>
      {hint && <p className="text-xs text-ink-soft">{hint}</p>}

      {userHits.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-ink-soft">Usuarios de Recomendados</p>
          <ul className="flex flex-wrap gap-2">
            {userHits.map((u) => (
              <li key={u.token}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => add(u)}
                  className="rounded-full border border-stamp px-3 py-1 text-sm"
                >
                  {u.name} <span className="text-ink-soft">{u.token}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {local.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Sugerencias">
          {local.map((s) => (
            <li key={s.token}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add(s)}
                className={
                  variant === "person"
                    ? "rounded-full border border-rule px-3 py-1 text-sm"
                    : "rounded border border-dashed border-mustard px-2 py-0.5 text-sm"
                }
              >
                + {s.name}
                {s.username && <span className="text-ink-soft"> @{s.username}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      {lookingForUsers && !q.startsWith("@") && (
        <p className="text-xs text-ink-soft">
          Pulsa Intro para añadir «{q}» como nombre, o elige un usuario de la lista.
        </p>
      )}
    </div>
  );
}

function PersonLabel({ p }: { p: Token }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="hand text-xl">{p.name}</span>
      {p.username && <span className="text-xs text-ink-soft">@{p.username}</span>}
    </span>
  );
}
