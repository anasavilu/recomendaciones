"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { markDone } from "@/app/actions";
import { KIND_LABEL } from "@/lib/catalog/types";
import { doneLabel, personOf, type EntryRow as Row } from "@/lib/entry-format";
import { Cover } from "./cover";
import { RecommendedBy } from "./recommended-by";
import { WouldRecommend } from "./would-recommend";

const UNDO_MS = 4000;

export function EntryRow({ entry }: { entry: Row }) {
  const c = entry.catalog_items;
  const router = useRouter();
  const meta = [KIND_LABEL[c.kind], c.year, c.creators?.[0] ?? c.address].filter(Boolean).join(", ");
  const tags = entry.entry_tags.map((t) => t.tags.name);
  const who = entry.entry_recommendations.map((r) => personOf(r.recommenders));

  // Estado mostrado: el del servidor, o el que acabas de marcar con el tic
  const [done, setDone] = useState(entry.status === "hecho");
  const [justChanged, setJustChanged] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const label = doneLabel(c.kind);
  const faded = done || entry.status === "descartado";

  // Al desmarcar se vuelve al estado que tenía (p. ej. "Empezado"), o a pendiente
  const notDoneStatus = entry.status === "hecho" ? "pendiente" : entry.status;

  function scheduleRefresh() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => router.refresh(), UNDO_MS);
  }

  async function toggle(next: boolean, isUndo = false) {
    if (timer.current) clearTimeout(timer.current);
    const prev = done;
    setDone(next);
    setFailed(false);
    setJustChanged(!isUndo);
    try {
      await markDone(entry.id, next ? "hecho" : notDoneStatus);
      // Pasados unos segundos, la lista se actualiza y la fila cambia de pestaña
      if (!isUndo) scheduleRefresh();
    } catch {
      setDone(prev);
      setJustChanged(false);
      setFailed(true);
    }
  }

  return (
    <li className="flex flex-col">
      <div className="flex items-center gap-2">
        <Link href={`/e/${entry.id}`} className="flex min-w-0 flex-1 gap-4 py-4 active:bg-rule/40">
          <Cover src={c.image_url} kind={c.kind} title={c.title} size="sm" />
          <div className={`flex min-w-0 flex-1 flex-col gap-1 transition-opacity ${faded ? "opacity-60" : ""}`}>
            <div className="flex items-baseline justify-between gap-3">
              <h3 className={`truncate text-[1.0625rem] font-semibold leading-snug ${done ? "line-through decoration-1" : ""}`}>
                {c.title}
              </h3>
              {!done && entry.status === "en_curso" && <span className="shrink-0 text-sm text-stamp">Empezado</span>}
            </div>
            <p className="truncate text-sm text-ink-soft">{meta}</p>
            <RecommendedBy people={who} className="text-lg" />
            {tags.length > 0 && (
              <ul className="mt-0.5 flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <li key={t} className="rounded bg-mustard-soft px-1.5 py-0.5 text-xs text-ink">
                    {t}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Link>
        <button
          type="button"
          onClick={() => toggle(!done)}
          aria-pressed={done}
          aria-label={done ? `Desmarcar «${c.title}» como ${label.toLowerCase()}` : `Marcar «${c.title}» como ${label.toLowerCase()}`}
          title={done ? `Desmarcar ${label.toLowerCase()}` : `Marcar como ${label.toLowerCase()}`}
          className="grid h-11 w-11 shrink-0 place-items-center"
        >
          <span
            aria-hidden
            className={`grid h-7 w-7 place-items-center rounded-full border-2 text-sm font-bold transition-colors ${
              done ? "border-stamp bg-stamp text-stamp-ink" : "border-rule text-transparent hover:border-stamp"
            }`}
          >
            ✓
          </span>
        </button>
      </div>
      {justChanged && (
        <p role="status" className="-mt-2 mb-3 flex items-center gap-3 pl-[4.5rem] text-sm text-ink-soft">
          <button type="button" onClick={() => toggle(!done, true)} className="font-semibold text-ink underline underline-offset-4">
            Deshacer
          </button>
        </p>
      )}
      {done && (
        <div className="-mt-2 mb-3 pl-[4.5rem]">
          {/* Si acabas de marcarlo, valorar da unos segundos más antes de que cambie de pestaña */}
          <WouldRecommend
            entryId={entry.id}
            initial={entry.would_recommend}
            compact
            onChange={justChanged ? scheduleRefresh : undefined}
          />
        </div>
      )}
      {failed && (
        <p role="alert" className="-mt-2 mb-3 pl-[4.5rem] text-sm text-stamp">
          No se ha podido guardar. Prueba otra vez.
        </p>
      )}
    </li>
  );
}
