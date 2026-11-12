"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { addEntry } from "../actions";
import { KIND_LABEL, type Candidate, type Kind } from "@/lib/catalog/types";
import { TokenInput, type Token } from "@/components/token-input";
import { Cover } from "@/components/cover";

const PICKABLE: Kind[] = ["pelicula", "serie", "documental", "libro", "restaurante", "otro"];

const PLACEHOLDER: Record<Kind, string> = {
  pelicula: "Título de la película",
  serie: "Título de la serie",
  documental: "Título del documental",
  libro: "Título o autor",
  restaurante: "Nombre del sitio, p. ej. Casa Dani",
  otro: "Qué es",
};

type SearchState = { status: "idle" | "loading" | "done" | "error"; results: Candidate[]; catalog: boolean };

export type AddInitial = { kind?: Kind; q?: string; picked?: Candidate; manual?: boolean };

export function AddForm({
  tagSuggestions,
  peopleSuggestions,
  initial = {},
}: {
  tagSuggestions: Token[];
  peopleSuggestions: Token[];
  initial?: AddInitial;
}) {
  const [kind, setKind] = useState<Kind>(initial.picked?.kind ?? initial.kind ?? "pelicula");
  const [q, setQ] = useState(initial.q ?? "");
  const [raw, setSearch] = useState<SearchState & { key: string }>({ status: "idle", results: [], catalog: true, key: "" });
  const [picked, setPicked] = useState<Candidate | null>(initial.picked ?? null);
  const [manual, setManual] = useState(Boolean(initial.manual));

  const active = !picked && !manual && kind !== "otro" && q.trim().length >= 2;
  const key = `${kind}:${q.trim()}`;
  // Solo mostramos resultados de la búsqueda vigente
  const search: SearchState =
    active && raw.key === key ? raw : { status: active ? "loading" : "idle", results: [], catalog: true };

  useEffect(() => {
    if (!active) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/catalog/search?kind=${kind}&q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal });
        const data = await res.json();
        setSearch({ status: res.ok ? "done" : "error", results: data.results ?? [], catalog: data.catalog ?? true, key });
      } catch (e) {
        if ((e as Error).name !== "AbortError") setSearch({ status: "error", results: [], catalog: true, key });
      }
    }, 350);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [active, key, kind, q]);

  const reset = () => {
    setPicked(null);
    setManual(false);
  };

  const chosen = picked || manual || kind === "otro";

  return (
    <form action={addEntry} className="flex flex-col gap-7">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm text-ink-soft">Qué te han recomendado</legend>
        <div className="flex flex-wrap gap-2">
          {PICKABLE.map((k) => (
            <button
              type="button"
              key={k}
              onClick={() => {
                if (k === kind) return;
                setKind(k);
                // Se conserva lo escrito: la búsqueda se repite sola en el nuevo tipo
                if (!manual) setPicked(null);
              }}
              aria-pressed={kind === k}
              className={`rounded-full border px-3.5 py-1.5 text-sm ${
                kind === k ? "border-ink bg-ink text-paper" : "border-rule bg-sheet"
              }`}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
      </fieldset>

      {!chosen && (
        <div className="flex flex-col gap-3">
          <label htmlFor="buscar" className="text-sm text-ink-soft">
            Búscalo
          </label>
          <input
            id="buscar"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={PLACEHOLDER[kind]}
            autoFocus
            autoComplete="off"
            className="rounded-lg border border-rule bg-sheet px-3 py-2.5 text-base"
          />
          <div aria-live="polite" className="text-sm text-ink-soft">
            {search.status === "loading" && "Buscando…"}
            {search.status === "error" && "El catálogo no responde ahora. Puedes añadirlo a mano."}
            {search.status === "done" && !search.catalog && "Para este tipo aún no hay catálogo conectado; añádelo a mano."}
            {search.status === "done" && search.catalog && search.results.length === 0 && "No aparece en el catálogo."}
          </div>
          {search.results.length > 0 && (
            <ul className="divide-y divide-rule rounded-lg border border-rule bg-sheet">
              {search.results.map((r) => (
                <li key={`${r.source}:${r.source_id}`}>
                  <button type="button" onClick={() => setPicked(r)} className="flex w-full gap-3 p-3 text-left">
                    <Cover src={r.image_url ?? null} kind={r.kind} title={r.title} size="sm" />
                    <span className="flex min-w-0 flex-col justify-center gap-0.5">
                      <span className="font-semibold">
                        {r.title}
                        {r.year ? <span className="font-normal text-ink-soft"> ({r.year})</span> : null}
                      </span>
                      {r.subtitle && <span className="truncate text-sm text-ink-soft">{r.subtitle}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={() => setManual(true)} className="self-start text-sm underline underline-offset-4">
            Añadir a mano
          </button>
        </div>
      )}

      {picked && (
        <div className="flex items-center gap-4 rounded-lg border border-rule bg-sheet p-3">
          <input type="hidden" name="source" value={picked.source} />
          <input type="hidden" name="source_id" value={picked.source_id} />
          <input type="hidden" name="picked_kind" value={picked.kind} />
          <input type="hidden" name="picked_title" value={picked.title} />
          <input type="hidden" name="picked_sub" value={picked.subtitle ?? ""} />
          <Cover src={picked.image_url ?? null} kind={picked.kind} title={picked.title} size="sm" />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="font-semibold">{picked.title}</span>
            <span className="truncate text-sm text-ink-soft">
              {[picked.year, picked.subtitle].filter(Boolean).join(", ")}
            </span>
          </div>
          <button type="button" onClick={reset} className="text-sm text-ink-soft underline underline-offset-4">
            Cambiar
          </button>
        </div>
      )}

      {(manual || kind === "otro") && (
        <div className="flex flex-col gap-4">
          <input type="hidden" name="source" value="manual" />
          <input type="hidden" name="kind" value={kind} />
          <Field label="Título" name="title" required defaultValue={q} />
          {kind === "restaurante" ? (
            <Field label="Dirección o zona" name="address" />
          ) : kind !== "otro" ? (
            <div className="grid grid-cols-[1fr_7rem] gap-3">
              <Field label={kind === "libro" ? "Autor" : "Director o creador"} name="creator" />
              <Field label="Año" name="year" inputMode="numeric" />
            </div>
          ) : null}
          <Field label="Enlace (opcional)" name="link" type="url" placeholder="https://" />
          {kind !== "otro" && (
            <button type="button" onClick={reset} className="self-start text-sm text-ink-soft underline underline-offset-4">
              Volver a buscar en el catálogo
            </button>
          )}
        </div>
      )}

      {chosen && (
        <>
          <TokenInput
            name="recommenders"
            label="¿Quién te lo ha recomendado?"
            variant="person"
            suggestions={peopleSuggestions}
            placeholder="Mamá, @ana, el podcast de…"
            hint="Escribe un nombre, o busca a alguien que use Recomendados por su nombre o @usuario."
          />
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-ink-soft">¿Qué te dijo? (opcional)</span>
            <input
              name="comment"
              placeholder="«Es perfecta para un domingo de lluvia»"
              className="rounded-lg border border-rule bg-sheet px-3 py-2.5 text-base"
            />
          </label>
          <TokenInput
            name="tags"
            label="Etiquetas"
            variant="tag"
            suggestions={tagSuggestions}
            placeholder="comedia romántica, para ver con mamá…"
            hint="Escribe y pulsa Intro o coma. Luego podrás buscar por ellas."
          />
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-ink-soft">Notas para ti (opcional)</span>
            <textarea name="notes" rows={3} className="rounded-lg border border-rule bg-sheet px-3 py-2.5 text-base" />
          </label>
          <Submit />
        </>
      )}
    </form>
  );
}

function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm text-ink-soft">{label}</span>
      <input {...props} className="rounded-lg border border-rule bg-sheet px-3 py-2.5 text-base" />
    </label>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className="rounded-full bg-stamp px-6 py-3.5 text-base font-semibold text-stamp-ink disabled:opacity-60">
      {pending ? "Guardando…" : "Guardar en mi lista"}
    </button>
  );
}
