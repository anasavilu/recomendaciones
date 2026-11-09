"use client";

import { useId, useState } from "react";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * Lista de valores (etiquetas o personas) con sugerencias de los que ya existen.
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
  initial?: string[];
  suggestions: string[];
  variant: "tag" | "person";
  placeholder?: string;
}) {
  const id = useId();
  const [values, setValues] = useState<string[]>(initial);
  const [text, setText] = useState("");

  const has = (v: string) => values.some((x) => norm(x) === norm(v));
  const add = (raw: string) => {
    const v = raw.replace(/,/g, " ").trim().replace(/\s+/g, " ");
    if (v && !has(v)) setValues((xs) => [...xs, v]);
    setText("");
  };
  const remove = (v: string) => setValues((xs) => xs.filter((x) => x !== v));

  const q = norm(text);
  const shown = suggestions.filter((s) => !has(s) && (!q || norm(s).includes(q))).slice(0, 8);

  const tokenCls =
    variant === "person"
      ? "hand text-xl"
      : "rounded bg-mustard-soft px-2 py-0.5 text-sm";

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm text-ink-soft">
        {label}
      </label>
      <input type="hidden" name={name} value={values.join(",")} />
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-rule bg-sheet px-3 py-2">
        {values.map((v) => (
          <button
            type="button"
            key={v}
            onClick={() => remove(v)}
            className={`${tokenCls} inline-flex items-center gap-1`}
            aria-label={`Quitar ${v}`}
          >
            {v}
            <span aria-hidden className="font-sans text-sm text-ink-soft">×</span>
          </button>
        ))}
        <input
          id={id}
          value={text}
          onChange={(e) => {
            const v = e.target.value;
            if (v.endsWith(",")) add(v.slice(0, -1));
            else setText(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (text.trim()) add(text);
            } else if (e.key === "Backspace" && !text && values.length) {
              setValues((xs) => xs.slice(0, -1));
            }
          }}
          onBlur={() => text.trim() && add(text)}
          placeholder={values.length ? "" : placeholder}
          className="min-w-32 flex-1 bg-transparent py-1 text-base outline-none"
          enterKeyHint="done"
        />
      </div>
      {hint && <p className="text-xs text-ink-soft">{hint}</p>}
      {shown.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Sugerencias">
          {shown.map((s) => (
            <li key={s}>
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
                + {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
