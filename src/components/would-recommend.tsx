"use client";

import { useState } from "react";
import { setWouldRecommend } from "@/app/actions";

/** 👍 / 👎 «¿Lo recomendarías?». Pulsar la opción elegida la quita. */
export function WouldRecommend({
  entryId,
  initial,
  onChange,
  compact = false,
}: {
  entryId: string;
  initial: boolean | null;
  onChange?: () => void;
  compact?: boolean;
}) {
  const [value, setValue] = useState(initial);
  const [failed, setFailed] = useState(false);

  async function choose(v: boolean) {
    const next = value === v ? null : v;
    const prev = value;
    setValue(next);
    setFailed(false);
    onChange?.();
    try {
      await setWouldRecommend(entryId, next);
    } catch {
      setValue(prev);
      setFailed(true);
    }
  }

  const btn = (v: boolean, emoji: string, label: string) => (
    <button
      type="button"
      onClick={() => choose(v)}
      aria-pressed={value === v}
      aria-label={label}
      title={label}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors ${
        value === v
          ? v
            ? "border-stamp bg-stamp text-stamp-ink"
            : "border-ink bg-ink text-paper"
          : "border-rule text-ink-soft"
      }`}
    >
      <span aria-hidden className={value === v ? "" : "grayscale"}>
        {emoji}
      </span>
      {!compact && <span>{v ? "Sí" : "No"}</span>}
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-ink-soft">
        {value === true ? "Lo recomendarías" : value === false ? "No lo recomendarías" : "¿Lo recomendarías?"}
      </span>
      {btn(true, "👍", "Sí, lo recomendaría")}
      {btn(false, "👎", "No lo recomendaría")}
      {failed && (
        <span role="alert" className="text-sm text-stamp">
          No se ha guardado. Prueba otra vez.
        </span>
      )}
    </div>
  );
}
