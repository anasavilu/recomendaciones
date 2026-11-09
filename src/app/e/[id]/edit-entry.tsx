"use client";

import { useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { deleteEntry, setStatus, updateEntry } from "../../actions";
import type { Kind } from "@/lib/catalog/types";
import type { Status } from "@/lib/entries";
import { TokenInput } from "@/components/token-input";

export function EditEntry(props: {
  entryId: string;
  kind: Kind;
  status: Status;
  notes: string;
  tags: string[];
  people: string[];
  tagSuggestions: string[];
  peopleSuggestions: string[];
}) {
  const [status, setLocal] = useState(props.status);
  const [, start] = useTransition();
  const [saved, setSaved] = useState(false);

  const done = props.kind === "libro" ? "Leído" : props.kind === "restaurante" ? "Ido" : "Visto";
  const options: [Status, string][] = [
    ["pendiente", "Pendiente"],
    ["en_curso", "Empezado"],
    ["hecho", done],
    ["descartado", "Descartado"],
  ];

  return (
    <section className="flex flex-col gap-7 border-t border-rule pt-7">
      <fieldset>
        <legend className="mb-2 text-sm text-ink-soft">Estado</legend>
        <div className="grid grid-cols-4 overflow-hidden rounded-lg border border-rule text-sm">
          {options.map(([s, label]) => (
            <button
              key={s}
              type="button"
              aria-pressed={status === s}
              onClick={() => {
                setLocal(s);
                start(() => setStatus(props.entryId, s));
              }}
              className={`px-2 py-2.5 ${status === s ? "bg-ink font-semibold text-paper" : "bg-sheet"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      <form
        action={async (fd) => {
          await updateEntry(props.entryId, fd);
          setSaved(true);
        }}
        onChange={() => setSaved(false)}
        className="flex flex-col gap-6"
      >
        <TokenInput
          name="recommenders"
          label="Te lo recomendó"
          variant="person"
          initial={props.people}
          suggestions={props.peopleSuggestions}
        />
        <TokenInput name="tags" label="Etiquetas" variant="tag" initial={props.tags} suggestions={props.tagSuggestions} />
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-ink-soft">Notas para ti</span>
          <textarea
            name="notes"
            rows={3}
            defaultValue={props.notes}
            className="rounded-lg border border-rule bg-sheet px-3 py-2.5 text-base"
          />
        </label>
        <div className="flex items-center gap-4">
          <SaveButton />
          {saved && (
            <span role="status" className="text-sm text-ink-soft">
              Cambios guardados
            </span>
          )}
        </div>
      </form>

      <form
        action={deleteEntry.bind(null, props.entryId)}
        onSubmit={(e) => {
          if (!confirm("¿Quitar esto de tu lista? No se puede deshacer.")) e.preventDefault();
        }}
      >
        <button className="text-sm text-stamp underline underline-offset-4">Quitar de mi lista</button>
      </form>
    </section>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper disabled:opacity-60">
      {pending ? "Guardando…" : "Guardar cambios"}
    </button>
  );
}
