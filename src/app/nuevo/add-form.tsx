"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { addEntry } from "../actions";
import { KIND_LABEL, type Candidate, type Kind } from "@/lib/catalog/types";
import { TokenInput, type Token } from "@/components/token-input";
import { Cover } from "@/components/cover";
import { PreviewDetails } from "@/components/catalog-preview";
import type { Draft } from "@/lib/catalog/assist";

// Tipos en los que, si el catálogo no lo tiene, se puede rellenar la ficha buscando en internet
const ASSIST: Kind[] = ["pelicula", "serie", "documental", "libro"];
const SCREEN: Kind[] = ["pelicula", "serie", "documental"];

type AssistState = { status: "idle" | "loading" | "none" | "error"; message?: string };

const PICKABLE: Kind[] = ["pelicula", "serie", "documental", "libro", "restaurante", "lugar", "evento", "otro"];

const PLACEHOLDER: Record<Kind, string> = {
  pelicula: "Título de la película",
  serie: "Título de la serie",
  documental: "Título del documental",
  libro: "Título o autor",
  restaurante: "Nombre del sitio, p. ej. Casa Dani",
  lugar: "Casa rural, hotel, museo… p. ej. casa rural El Olivar",
  evento: "Obra, exposición, musical… o la sala",
  otro: "Qué es",
};

type SearchState = { status: "idle" | "loading" | "done" | "error"; results: Candidate[]; catalog: boolean; corrected?: string | null };

export type AddInitial = { kind?: Kind; q?: string; picked?: Candidate; manual?: boolean; assist?: boolean };

/**
 * Next guarda las pantallas ya visitadas con su estado. Cada vez que se llega a «Nueva recomendación»
 * desde un enlace, el formulario empieza vacío (al volver atrás con el navegador sí se conserva).
 */
export function AddForm(props: Parameters<typeof AddFormInner>[0]) {
  const { bfcacheId } = useRouter();
  return <AddFormInner key={bfcacheId} {...props} />;
}

function AddFormInner({
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
  const [draft, setDraft] = useState<Draft | null>(null);
  const [assist, setAssist] = useState<AssistState>({ status: "idle" });
  const canAssist = ASSIST.includes(kind);

  // Desde el buscador principal con «Búscalo por internet»: se busca al llegar
  const autoAssist = useRef(Boolean(initial.assist && initial.q));
  useEffect(() => {
    if (!autoAssist.current) return;
    autoAssist.current = false;
    void lookUp(initial.q!, !initial.kind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function lookUp(text: string, anyKind = false) {
    const term = text.trim();
    if (term.length < 2 || assist.status === "loading") return;
    setManual(true);
    setPicked(null);
    setAssist({ status: "loading" });
    try {
      const res = await fetch("/api/catalog/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: term, ...(anyKind ? {} : { kind }) }),
      });
      const data = (await res.json().catch(() => ({}))) as { draft?: Draft | null; error?: string };
      if (!res.ok) return setAssist({ status: "error", message: data.error ?? "No he podido buscarlo ahora." });
      if (!data.draft) return setAssist({ status: "none" });
      setDraft(data.draft);
      if (data.draft.kind !== kind) setKind(data.draft.kind);
      setAssist({ status: "idle" });
    } catch {
      setAssist({ status: "error", message: "No he podido buscarlo. Revisa la conexión." });
    }
  }

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
        setSearch({ status: res.ok ? "done" : "error", results: data.results ?? [], catalog: data.catalog ?? true, corrected: data.corrected ?? null, key });
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
    setDraft(null);
    setAssist({ status: "idle" });
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
            {search.status === "done" && search.catalog && search.results.length === 0 && (
              <>
                No aparece en el catálogo.
                {canAssist && (
                  <>
                    {" "}
                    <button type="button" onClick={() => lookUp(q)} className="font-semibold text-ink underline underline-offset-4">
                      Búscalo por internet
                    </button>{" "}
                    y te relleno la ficha.
                  </>
                )}
              </>
            )}
            {search.status === "done" && search.corrected && search.results.length > 0 && (
              <>
                Resultados de <strong className="font-semibold text-ink">«{search.corrected}»</strong>
              </>
            )}
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
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <button type="button" onClick={() => setManual(true)} className="underline underline-offset-4">
              Añadir a mano
            </button>
            {canAssist && q.trim().length >= 2 && (
              <button type="button" onClick={() => lookUp(q)} className="underline underline-offset-4">
                ¿No está? Búscalo por internet
              </button>
            )}
          </p>
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
      {picked && picked.source !== "google_places" && (
        <div className="-mt-2 rounded-lg border border-rule px-3 py-3">
          <PreviewDetails candidate={picked} compact />
        </div>
      )}

      {(manual || kind === "otro") && (
        <div className="flex flex-col gap-4">
          <input type="hidden" name="source" value="manual" />
          <input type="hidden" name="kind" value={kind} />

          {canAssist && (
            <div aria-live="polite" className="rounded-lg border border-rule px-3 py-3 text-sm">
              {assist.status === "loading" ? (
                <p className="text-ink-soft">Buscando en internet… tarda unos segundos.</p>
              ) : draft ? (
                <div className="flex flex-col gap-1">
                  <p>He rellenado la ficha con lo que he encontrado. Revísala antes de guardar.</p>
                  {draft.sources.length > 0 && (
                    <p className="text-xs text-ink-soft">
                      Fuentes:{" "}
                      {draft.sources.map((s, i) => (
                        <span key={s.url}>
                          {i > 0 && ", "}
                          <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                            {s.title || new URL(s.url).hostname}
                          </a>
                        </span>
                      ))}
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {assist.status === "none" && <p>No he encontrado nada fiable con ese nombre. Prueba a escribirlo de otra forma o rellénalo a mano.</p>}
                  {assist.status === "error" && <p className="text-stamp">{assist.message}</p>}
                  {assist.status === "idle" && <p className="text-ink-soft">Escribe el título y te busco el resto de datos.</p>}
                  <button
                    type="button"
                    onClick={() => lookUp((document.getElementById("titulo-manual") as HTMLInputElement | null)?.value ?? q)}
                    className="self-start rounded-full border border-stamp px-3 py-1 text-stamp"
                  >
                    Rellenar buscando en internet
                  </button>
                </div>
              )}
            </div>
          )}

          {/* La clave hace que los campos se rellenen de nuevo al llegar el borrador */}
          <div key={draft ? `${draft.title}:${draft.year}` : "vacio"} className="flex flex-col gap-4">
            <Field id="titulo-manual" label="Título" name="title" required defaultValue={draft?.title ?? q} />
            {draft?.original_title && <input type="hidden" name="original_title" value={draft.original_title} />}
            {kind === "restaurante" || kind === "lugar" ? (
              <Field label="Dirección o zona" name="address" />
            ) : kind !== "otro" ? (
              <div className="grid grid-cols-[1fr_7rem] gap-3">
                <Field
                  label={kind === "libro" ? "Autor" : "Director o creador"}
                  name="creator"
                  defaultValue={draft?.creators.join(", ") ?? ""}
                />
                <Field label="Año" name="year" inputMode="numeric" defaultValue={draft?.year ?? ""} />
              </div>
            ) : null}
            {canAssist && (
              <>
                <Field label="Género (opcional)" name="genres" defaultValue={draft?.genres.join(", ") ?? ""} />
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm text-ink-soft">Sinopsis (opcional)</span>
                  <textarea
                    name="summary"
                    rows={4}
                    defaultValue={draft?.summary ?? ""}
                    className="rounded-lg border border-rule bg-sheet px-3 py-2.5 text-base"
                  />
                </label>
              </>
            )}
            {SCREEN.includes(kind) && (
              <Field label="Dónde verla (opcional)" name="platforms" placeholder="Netflix, Filmin…" defaultValue={draft?.platforms.join(", ") ?? ""} />
            )}
            <Field label="Enlace (opcional)" name="link" type="url" placeholder="https://" defaultValue={draft?.link ?? ""} />
          </div>
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
      <input {...props} className="w-full min-w-0 rounded-lg border border-rule bg-sheet px-3 py-2.5 text-base" />
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
