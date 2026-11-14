"use client";

import { useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { deleteEntry, setStatus, updateEntry } from "../../actions";
import type { Kind } from "@/lib/catalog/types";
import { doneLabel, type Status } from "@/lib/entry-format";
import { TokenInput, type Token } from "@/components/token-input";
import { WouldRecommend } from "@/components/would-recommend";

export function EditEntry(props: {
  entryId: string;
  kind: Kind;
  status: Status;
  wouldRecommend: boolean | null;
  notes: string;
  tags: Token[];
  people: Token[];
  tagSuggestions: Token[];
  peopleSuggestions: Token[];
}) {
  const [status, setLocal] = useState(props.status);
  const [, start] = useTransition();
  const [saved, setSaved] = useState(false);

  const done = doneLabel(props.kind);
  // En sitios no tiene sentido "Empezado"
  const isPlace = props.kind === "restaurante" || props.kind === "lugar" || props.kind === "evento";
  const options: [Status, string][] = [
    ["pendiente", "Pendiente"],
    ...(isPlace ? [] : ([["en_curso", "Empezado"]] as [Status, string][])),
    ["hecho", done],
    ["descartado", "Descartado"],
  ];

  return (
    <section className="flex flex-col gap-7 border-t border-rule pt-7">
      <fieldset>
        <legend className="mb-2 text-sm text-ink-soft">Estado</legend>
        <div
          className={`grid overflow-hidden rounded-lg border border-rule text-sm ${options.length === 3 ? "grid-cols-3" : "grid-cols-4"}`}
        >
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
        {status === "hecho" && (
          <div className="mt-4">
            <WouldRecommend entryId={props.entryId} initial={props.wouldRecommend} />
          </div>
        )}
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
