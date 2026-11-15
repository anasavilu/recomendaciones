"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { KIND_LABEL, type Candidate, type CatalogDetails } from "@/lib/catalog/types";
import { ratingOf } from "@/lib/entry-format";
import { genreLabel, platformList } from "@/lib/facets";
import { dateRange } from "@/lib/catalog/events/shared";
import { Cover } from "./cover";

const LINK_LABEL: Record<string, string> = {
  filmaffinity: "FilmAffinity",
  imdb: "IMDb",
  donde_ver: "Dónde verla",
  google_books: "Google Books",
  openlibrary: "Open Library",
  maps: "Google Maps",
  web: "Web",
};

/** Ficha de un resultado (sin guardar): sinopsis, nota, dónde verlo… */
export function PreviewDetails({ candidate, compact = false }: { candidate: Candidate; compact?: boolean }) {
  const [state, setState] = useState<{ key: string; details: CatalogDetails | null; failed: boolean } | null>(null);
  const key = `${candidate.source}:${candidate.source_id}`;
  const free = candidate.source !== "google_places";

  useEffect(() => {
    if (!free) return;
    const ctrl = new AbortController();
    fetch(`/api/catalog/preview?source=${encodeURIComponent(candidate.source)}&id=${encodeURIComponent(candidate.source_id)}`, {
      signal: ctrl.signal,
    })
      .then((r) => r.json())
      .then((d) => setState({ key, details: d.details ?? null, failed: !d.details }))
      .catch((e) => {
        if ((e as Error).name !== "AbortError") setState({ key, details: null, failed: true });
      });
    return () => ctrl.abort();
  }, [key, free, candidate.source, candidate.source_id]);

  const current = state?.key === key ? state : null;
  const d = current?.details;

  if (!free) {
    // Sitios de Google: lo que ya trae la búsqueda y enlace a Google Maps (sin coste)
    return (
      <div className="flex flex-col gap-2 text-sm">
        {candidate.subtitle && <p>{candidate.subtitle}</p>}
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(candidate.title)}&query_place_id=${encodeURIComponent(candidate.source_id)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="self-start underline underline-offset-4"
        >
          Ver fotos y opiniones en Google Maps
        </a>
        <p className="text-xs text-ink-soft">Al añadirlo se guardan la dirección, el horario, el teléfono y la nota de Google.</p>
      </div>
    );
  }

  if (!current) return <p className="text-sm text-ink-soft">Cargando la ficha…</p>;
  if (!d) return <p className="text-sm text-ink-soft">No se ha podido cargar la ficha, pero puedes añadirlo igualmente.</p>;

  const rating = ratingOf(d.extra);
  const when = d.kind === "evento" ? dateRange((d.extra?.start as string) ?? null, (d.extra?.end as string) ?? null) : null;
  const streaming = platformList((d.extra?.streaming_es as string[] | undefined) ?? []);
  const genres = (d.genres ?? []).map((g) => genreLabel(g, d.kind, d.source === "google_books" || d.source === "openlibrary") ?? "").filter(Boolean);
  const facts = [d.year && d.kind !== "evento" ? String(d.year) : null, [...new Set(genres)].slice(0, 3).join(", ")].filter(Boolean).join(" · ");
  const order = Object.keys(LINK_LABEL);
  const links = Object.entries(d.links ?? {})
    .filter(([k]) => LINK_LABEL[k])
    .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b));

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex flex-col gap-1">
        {d.original_title && d.original_title !== d.title && <p className="italic text-ink-soft">{d.original_title}</p>}
        {facts && <p className="text-ink-soft">{facts}</p>}
        {d.creators && d.creators.length > 0 && <p>{d.creators.slice(0, 3).join(", ")}</p>}
        {d.address && <p>{d.address}</p>}
        {when && <p>{when}</p>}
        {rating && <p className="font-semibold">{rating}</p>}
        {streaming.length > 0 && <p>En España, en {streaming.join(", ")}</p>}
      </div>
      {d.summary && <p className={`leading-relaxed ${compact ? "line-clamp-4" : "line-clamp-[8]"}`}>{d.summary}</p>}
      {links.length > 0 && (
        <p className="flex flex-wrap gap-x-4 gap-y-1">
          {links.map(([k, url]) => (
            <a key={k} href={url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
              {LINK_LABEL[k]}
            </a>
          ))}
        </p>
      )}
    </div>
  );
}

/** Panel desde abajo con la vista previa de un resultado y el botón de añadir. */
export function PreviewSheet({
  candidate,
  addHref,
  entryId,
  onClose,
}: {
  candidate: Candidate;
  addHref: string;
  entryId: string | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={candidate.title}>
      <button type="button" aria-label="Cerrar" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className="relative flex max-h-[88dvh] w-full max-w-2xl flex-col rounded-t-2xl bg-paper shadow-2xl">
        <div className="flex flex-col gap-4 overflow-y-auto px-5 pt-5 pb-4">
          <div className="flex items-center gap-4">
            <Cover src={candidate.image_url ?? null} kind={candidate.kind} title={candidate.title} size="sm" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="text-xs text-ink-soft">{KIND_LABEL[candidate.kind]}</p>
              <h2 className="text-xl font-semibold leading-tight text-balance">{candidate.title}</h2>
            </div>
          </div>
          <PreviewDetails candidate={candidate} />
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-rule px-5 py-4">
          <button type="button" onClick={onClose} className="text-sm text-ink-soft">
            Cerrar
          </button>
          {entryId ? (
            <Link href={`/e/${entryId}`} onNavigate={onClose} className="rounded-full border border-ink px-5 py-2.5 text-sm font-semibold">
              Ya en tu lista: ver ficha
            </Link>
          ) : (
            <Link href={addHref} onNavigate={onClose} className="rounded-full bg-stamp px-5 py-2.5 text-sm font-semibold text-stamp-ink">
              Añadir a mi lista
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
