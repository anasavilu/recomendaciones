"use client";

import { useEffect, useId, useRef, useState } from "react";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Valor del campo. En personas, `token` es "@usuario" si es alguien de la app o el nombre libre si no. */
export type Token = { token: string; name: string; username?: string | null; network?: boolean };

type Option = { key: string; label: React.ReactNode; value: Token; group: "nuevo" | "red" | "usuarios" | "usados" };

/**
 * Lista de valores (etiquetas o personas). Mientras escribes, un desplegable propone:
 * añadir lo escrito, usuarios de la app (personas) y lo que ya has usado antes.
 * Se envía en el formulario como un campo oculto separado por comas.
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
  const listId = `${id}-opciones`;
  const [values, setValues] = useState<Token[]>(initial);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [users, setUsers] = useState<{ q: string; results: Token[] }>({ q: "", results: [] });
  const inputRef = useRef<HTMLInputElement>(null);

  const q = text.trim();
  const nq = norm(q.replace(/^@/, ""));
  const lookingForUsers = variant === "person" && nq.length >= 2;

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
    setActive(0);
    inputRef.current?.focus();
  };
  const remove = (tok: string) => setValues((xs) => xs.filter((x) => x.token !== tok));
  const asFree = (raw: string): Token => {
    const v = raw.replace(/,/g, " ").trim().replace(/\s+/g, " ").replace(/^@/, "");
    return { token: v, name: v };
  };

  // Opciones del desplegable
  const matches = (s: Token) => !nq || norm(s.name).includes(nq) || (s.username ?? "").includes(nq);
  // Gente que sigues o que te sigue va primero, luego el resto de usuarios y lo ya usado
  const network = suggestions.filter((s) => s.network && !has(s.token) && matches(s)).slice(0, 6);
  const userHits =
    lookingForUsers && users.q === q ? users.results.filter((u) => !has(u.token) && !network.some((n) => n.token === u.token)) : [];
  const used = suggestions
    .filter((s) => !s.network && !has(s.token) && !userHits.some((u) => u.token === s.token))
    .filter(matches)
    .slice(0, 6);
  const exactExisting = [...network, ...userHits, ...used].some((o) => norm(o.name) === nq || o.username === nq);
  const newOption: Option[] = [
    ...(asFree(q).name && !exactExisting && !has(asFree(q).token)
      ? [
          {
            key: "nuevo",
            group: "nuevo" as const,
            value: asFree(q),
            label: (
              <>
                Añadir <strong>«{asFree(q).name}»</strong>
                {variant === "person" && <span className="text-ink-soft"> como nombre</span>}
              </>
            ),
          },
        ]
      : []),
  ];
  const found: Option[] = [
    ...network.map((u) => ({
      key: `r:${u.token}`,
      group: "red" as const,
      value: u,
      label: (
        <>
          {u.name} <span className="text-ink-soft">{u.token}</span>
        </>
      ),
    })),
    ...userHits.map((u) => ({
      key: `u:${u.token}`,
      group: "usuarios" as const,
      value: u,
      label: (
        <>
          {u.name} <span className="text-ink-soft">{u.token}</span>
        </>
      ),
    })),
    ...used.map((s) => ({
      key: `s:${s.token}`,
      group: "usados" as const,
      value: s,
      label: (
        <>
          {s.name}
          {s.username && <span className="text-ink-soft"> @{s.username}</span>}
        </>
      ),
    })),
  ];
  // Si se empieza por @ se busca a un usuario: «Añadir como nombre» va al final
  const options: Option[] = q.startsWith("@") ? [...found, ...newOption] : [...newOption, ...found];
  const showList = open && options.length > 0;
  const current = Math.min(active, Math.max(options.length - 1, 0));

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm text-ink-soft">
        {label}
      </label>
      <input type="hidden" name={name} value={values.map((v) => v.token).join(",")} />
      <div className="relative">
        <div
          className="flex flex-wrap items-center gap-2 rounded-lg border border-rule bg-sheet px-3 py-2"
          onClick={() => inputRef.current?.focus()}
        >
          {values.map((v) => (
            <button
              type="button"
              key={v.token}
              onClick={(e) => {
                e.stopPropagation();
                remove(v.token);
              }}
              className={`inline-flex items-center gap-1 ${variant === "person" ? "" : "rounded bg-mustard-soft px-2 py-0.5 text-sm"}`}
              aria-label={`Quitar ${v.name}`}
            >
              {variant === "person" ? (
                <span className="inline-flex items-baseline gap-1">
                  <span className="hand text-xl">{v.name}</span>
                  {v.username && <span className="text-xs text-ink-soft">@{v.username}</span>}
                </span>
              ) : (
                v.name
              )}
              <span aria-hidden className="text-sm text-ink-soft">
                ×
              </span>
            </button>
          ))}
          <input
            id={id}
            ref={inputRef}
            value={text}
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            onFocus={() => setOpen(true)}
            onBlur={() => {
              setOpen(false);
              // Si se sale del campo con algo escrito, se guarda tal cual para no perderlo
              if (q) {
                if (asFree(q).name && !has(asFree(q).token)) setValues((xs) => [...xs, asFree(q)]);
                setText("");
              }
            }}
            onChange={(e) => {
              const v = e.target.value;
              setOpen(true);
              setActive(0);
              if (v.endsWith(",")) {
                if (v.slice(0, -1).trim()) add(asFree(v.slice(0, -1)));
              } else setText(v);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" && options.length) {
                e.preventDefault();
                setActive((current + 1) % options.length);
              } else if (e.key === "ArrowUp" && options.length) {
                e.preventDefault();
                setActive((current - 1 + options.length) % options.length);
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (showList) add(options[current].value);
                else if (asFree(q).name) add(asFree(q));
              } else if (e.key === "Escape") {
                setOpen(false);
              } else if (e.key === "Backspace" && !text && values.length) {
                setValues((xs) => xs.slice(0, -1));
              }
            }}
            placeholder={values.length ? "" : placeholder}
            className="min-w-32 flex-1 bg-transparent py-1 text-base outline-none"
            enterKeyHint="done"
            autoComplete="off"
          />
        </div>

        {showList && (
          <ul
            id={listId}
            role="listbox"
            className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-rule bg-sheet py-1 shadow-lg"
          >
            {options.map((o, i) => {
              const header =
                (i === 0 || options[i - 1].group !== o.group) && o.group !== "nuevo"
                  ? o.group === "red"
                    ? "Gente que sigues"
                    : o.group === "usuarios"
                    ? "Otros usuarios de Recomendados"
                    : variant === "person"
                      ? "Ya te han recomendado"
                      : "Tus etiquetas"
                  : null;
              return (
                <li key={o.key} role="presentation">
                  {header && <p className="px-3 pt-2 pb-1 text-xs text-ink-soft">{header}</p>}
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === current}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => add(o.value)}
                    className={`block w-full px-3 py-2 text-left text-sm ${i === current ? "bg-rule/60" : ""}`}
                  >
                    {o.label}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {hint && <p className="text-xs text-ink-soft">{hint}</p>}
    </div>
  );
}
