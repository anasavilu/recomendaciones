"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { SearchResponse } from "@/app/api/search/route";
import { KIND_LABEL, type Candidate, type Kind } from "@/lib/catalog/types";
import { Cover } from "./cover";
import { PreviewSheet } from "./catalog-preview";
import { EntryRow } from "./entry-row";

type State = { key: string; status: "loading" | "done" | "error"; data: SearchResponse | null };

/**
 * Un solo buscador: mientras escribes, enseña lo que ya tienes guardado
 * y, debajo, lo que puedes añadir desde los catálogos.
 * Sin texto, deja ver la lista normal (children).
 */
export function HomeSearch({
  initialQ,
  kind,
  filters,
  children,
}: {
  initialQ: string;
  kind: Kind | null;
  filters: React.ReactNode;
  children: React.ReactNode;
}) {
  const [q, setQ] = useState(initialQ);
  // Si se llega con otro ?q= (p. ej. pulsando una etiqueta), se usa ese
  const [seenInitial, setSeenInitial] = useState(initialQ);
  if (initialQ !== seenInitial) {
    setSeenInitial(initialQ);
    setQ(initialQ);
  }

  const term = q.trim();
  const searching = term.length >= 2;
  const key = `${kind ?? ""}|${term}`;
  const [state, setState] = useState<State>({ key: "", status: "done", data: null });
  const [preview, setPreview] = useState<{ c: Candidate; href: string } | null>(null);

  // Mantener ?q= en la URL para que al volver atrás siga la búsqueda
  useEffect(() => {
    const url = new URL(window.location.href);
    if (term) url.searchParams.set("q", term);
    else url.searchParams.delete("q");
    window.history.replaceState(null, "", url);
  }, [term]);

  useEffect(() => {
    if (!searching) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const p = new URLSearchParams({ q: term });
        if (kind) p.set("tipo", kind);
        const res = await fetch(`/api/search?${p}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error(String(res.status));
        setState({ key, status: "done", data: (await res.json()) as SearchResponse });
      } catch (e) {
        if ((e as Error).name !== "AbortError") setState({ key, status: "error", data: null });
      }
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [searching, term, kind, key]);

  const current = state.key === key ? state : { key, status: "loading" as const, data: null };
  // Lo que ya sale en "En tu lista" no se repite abajo
  const mineIds = new Set(current.data?.mine.map((e) => e.id) ?? []);
  const catalog = current.data?.catalog.filter((c) => !c.entryId || !mineIds.has(c.entryId)) ?? [];
  const manualHref = `/nuevo?${new URLSearchParams({ q: term, ...(kind ? { tipo: kind } : {}) })}`;

  return (
    <>
      <div role="search" className="sticky top-0 z-10 -mx-4 bg-paper/95 px-4 pb-3 pt-1 backdrop-blur sm:-mx-6 sm:px-6">
        <label className="sr-only" htmlFor="q">
          Buscar en tu lista o algo nuevo para añadir
        </label>
        <div className="relative">
          <input
            id="q"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Busca en tu lista o algo nuevo…"
            autoComplete="off"
            enterKeyHint="search"
            className="w-full rounded-full border border-rule bg-sheet px-5 py-3 pr-12 text-base placeholder:text-ink-soft/70 [&::-webkit-search-cancel-button]:hidden"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              aria-label="Borrar búsqueda"
              className="absolute right-3 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-lg text-ink-soft"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {filters}

      {!searching ? (
        children
      ) : (
        <div className="mt-4 flex flex-col gap-8">
          <section aria-labelledby="mine-h">
            <h2 id="mine-h" className="border-b border-rule pb-2 text-sm font-semibold">
              En tu lista
            </h2>
            {current.status === "loading" && <p className="py-4 text-sm text-ink-soft">Buscando…</p>}
            {current.status === "error" && (
              <p className="py-4 text-sm text-stamp">No se ha podido buscar. Revisa la conexión y vuelve a probar.</p>
            )}
            {current.data &&
              (current.data.mine.length ? (
                <ul className="divide-y divide-rule">
                  {current.data.mine.map((e) => (
                    <EntryRow key={e.id} entry={e} />
                  ))}
                </ul>
              ) : (
                <p className="py-4 text-sm text-ink-soft">Nada guardado con «{term}».</p>
              ))}
          </section>

          <section aria-labelledby="new-h">
            <h2 id="new-h" className="border-b border-rule pb-2 text-sm font-semibold">
              Añadir a tu lista
            </h2>
            {current.data?.corrected && (
              <p className="pt-3 text-sm text-ink-soft">
                Resultados de <strong className="font-semibold text-ink">«{current.data.corrected}»</strong>
              </p>
            )}
            {current.data?.catalogFailed && (
              <p className="py-4 text-sm text-ink-soft">Los catálogos no responden ahora.</p>
            )}
            {catalog.length > 0 && (
              <ul className="divide-y divide-rule">
                {catalog.map((c) => {
                  const meta =
                    c.subtitle && c.subtitle !== KIND_LABEL[c.kind] && !c.subtitle.startsWith(KIND_LABEL[c.kind])
                      ? `${KIND_LABEL[c.kind]}, ${c.subtitle}`
                      : (c.subtitle ?? KIND_LABEL[c.kind]);
                  const href = c.entryId
                    ? `/e/${c.entryId}`
                    : `/nuevo?${new URLSearchParams({
                        source: c.source,
                        source_id: c.source_id,
                        tipo: c.kind,
                        title: c.title,
                        ...(c.year ? { year: String(c.year) } : {}),
                        ...(c.subtitle ? { sub: c.subtitle } : {}),
                        ...(c.image_url ? { img: c.image_url } : {}),
                      })}`;
                  const body = (
                    <>
                      <Cover src={c.image_url ?? null} kind={c.kind} title={c.title} size="sm" />
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="font-semibold leading-snug">
                          {c.title}
                          {c.year ? <span className="font-normal text-ink-soft"> ({c.year})</span> : null}
                        </span>
                        <span className="truncate text-sm text-ink-soft">{meta}</span>
                        {!c.entryId && <span className="text-xs text-ink-soft underline underline-offset-2">Ver ficha</span>}
                      </div>
                    </>
                  );
                  return (
                    <li key={`${c.source}:${c.source_id}`} className="flex items-center gap-3">
                      {c.entryId ? (
                        <Link href={href} className="flex min-w-0 flex-1 items-center gap-4 py-3">
                          {body}
                          <span className="shrink-0 text-sm text-ink-soft">Ya en tu lista</span>
                        </Link>
                      ) : (
                        <>
                          {/* Tocar el resultado abre la ficha para comprobar que es ese; «Añadir» va directo */}
                          <button
                            type="button"
                            onClick={() => setPreview({ c, href })}
                            className="flex min-w-0 flex-1 items-center gap-4 py-3 text-left"
                          >
                            {body}
                          </button>
                          <Link href={href} className="shrink-0 rounded-full border border-stamp px-3 py-1 text-sm text-stamp">
                            Añadir
                          </Link>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {current.data && (
              <p className="pt-4 text-sm text-ink-soft">
                {catalog.length ? "¿No es ninguno? " : "No aparece en los catálogos. "}
                <Link href={manualHref} className="text-ink underline underline-offset-4">
                  Añadir «{term}» a mano
                </Link>
                {(!kind || ["pelicula", "serie", "documental", "libro"].includes(kind)) && (
                  <>
                    {" o "}
                    <Link href={`${manualHref}&ayuda=1`} className="text-ink underline underline-offset-4">
                      búscalo por internet
                    </Link>
                  </>
                )}
              </p>
            )}
          </section>
        </div>
      )}

      {preview && (
        <PreviewSheet candidate={preview.c} addHref={preview.href} entryId={null} onClose={() => setPreview(null)} />
      )}
    </>
  );
}
