"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { markDone, removeEntry } from "@/app/actions";
import { KIND_LABEL } from "@/lib/catalog/types";
import { doneLabel, eventTiming, googleRating, personOf, type EntryRow as Row } from "@/lib/entry-format";
import { shortDate } from "@/lib/catalog/events/shared";
import { Cover } from "./cover";
import { RecommendedBy } from "./recommended-by";
import { WouldRecommend } from "./would-recommend";
import { FavoriteStar } from "./favorite-star";

const UNDO_MS = 4000;
const DELETE_UNDO_MS = 5000;
// Ancho del botón "Eliminar" que aparece al deslizar
const REVEAL = 96;

export function EntryRow({ entry }: { entry: Row }) {
  const c = entry.catalog_items;
  const router = useRouter();
  const timing = c.kind === "evento" ? eventTiming(c.extra) : null;
  const venue = c.kind === "evento" ? ((c.extra?.venue as string | null) ?? null) : null;
  const meta = [
    KIND_LABEL[c.kind],
    googleRating(c.extra, true),
    c.kind === "evento" ? null : c.year,
    timing?.end ? `hasta ${shortDate(timing.end)}` : timing?.start ? shortDate(timing.start) : null,
    venue ?? c.creators?.[0] ?? c.address,
  ]
    .filter(Boolean)
    .join(", ");
  const tags = entry.entry_tags.map((t) => t.tags.name);
  const who = entry.entry_recommendations.map((r) => personOf(r.recommenders));

  // Estado mostrado: el del servidor, o el que acabas de marcar con el tic
  const [done, setDone] = useState(entry.status === "hecho");
  const [justChanged, setJustChanged] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  // ---- Deslizar a la izquierda para eliminar ----
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const drag = useRef<{
    x: number;
    y: number;
    from: number;
    active: boolean;
  } | null>(null);
  const swallowClick = useRef(false);
  const deleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDelete = useRef(false);
  const open = offset <= -REVEAL;

  // Si sales de la pantalla con un borrado pendiente, se completa
  useEffect(
    () => () => {
      if (deleteTimer.current) clearTimeout(deleteTimer.current);
      if (pendingDelete.current) void removeEntry(entry.id).catch(() => {});
    },
    [entry.id],
  );

  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, from: offset, active: false };
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.active) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
        drag.current = null; // es scroll vertical
        return;
      }
      if (Math.abs(dx) < 10) return;
      d.active = true;
      setDragging(true);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    setOffset(Math.max(-REVEAL * 1.4, Math.min(0, d.from + dx)));
  }
  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    if (!d?.active) return;
    setDragging(false);
    swallowClick.current = true;
    setOffset((o) => (o < -REVEAL / 2 ? -REVEAL : 0));
  }
  function onClickCapture(e: React.MouseEvent) {
    // El clic que lanza el navegador al soltar tras deslizar no cuenta
    if (swallowClick.current) {
      e.preventDefault();
      e.stopPropagation();
      swallowClick.current = false;
      return;
    }
    // Con "Eliminar" visible, tocar la fila la cierra en vez de abrir la ficha
    if (open) {
      e.preventDefault();
      e.stopPropagation();
      setOffset(0);
    }
  }

  function startDelete() {
    setDeleted(true);
    setOffset(0);
    pendingDelete.current = true;
    deleteTimer.current = setTimeout(async () => {
      pendingDelete.current = false;
      setDeleting(true);
      try {
        await removeEntry(entry.id);
        router.refresh();
      } catch {
        setDeleted(false);
        setDeleting(false);
        setFailed(true);
      }
    }, DELETE_UNDO_MS);
  }
  function undoDelete() {
    if (deleteTimer.current) clearTimeout(deleteTimer.current);
    pendingDelete.current = false;
    setDeleted(false);
  }

  const label = doneLabel(c.kind);
  // Tachado y atenuado solo como transición, mientras la fila se va a la otra pestaña
  const leaving = justChanged && done;
  const faded = leaving || entry.status === "descartado";

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

  if (deleted) {
    return (
      <li
        role="status"
        className="flex items-center justify-between gap-3 py-4 text-sm text-ink-soft"
      >
        <span className="min-w-0 truncate">
          {deleting ? "Eliminando…" : `Eliminado «${c.title}»`}
        </span>
        {!deleting && (
          <button
            type="button"
            onClick={undoDelete}
            className="shrink-0 font-semibold text-ink underline underline-offset-4"
          >
            Deshacer
          </button>
        )}
      </li>
    );
  }

  return (
    <li className="relative overflow-hidden">
      <button
        type="button"
        onClick={startDelete}
        tabIndex={open ? 0 : -1}
        aria-hidden={!open}
        className="absolute inset-y-0 right-0 bg-stamp font-semibold text-stamp-ink"
        style={{ width: REVEAL }}
      >
        Eliminar
      </button>
      <div
        className={`relative flex flex-col bg-paper ${dragging ? "" : "transition-transform duration-200"}`}
        style={{ transform: `translateX(${offset}px)`, touchAction: "pan-y" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={onClickCapture}
        onDragStart={(e) => e.preventDefault()}
      >
        <div className="flex items-center gap-2">
          <Link
            href={`/e/${entry.id}`}
            className="flex min-w-0 flex-1 gap-4 py-4 active:bg-rule/40"
          >
            <Cover src={c.image_url} kind={c.kind} title={c.title} size="sm" />
            <div
              className={`flex min-w-0 flex-1 flex-col gap-1 transition-opacity ${faded ? "opacity-60" : ""}`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <h3
                  className={`truncate text-[1.0625rem] font-semibold leading-snug ${leaving ? "line-through decoration-1" : ""}`}
                >
                  {c.title}
                </h3>
                {!done && entry.status === "en_curso" && (
                  <span className="shrink-0 text-sm text-stamp">Empezado</span>
                )}
                {!done && timing?.state === "soon" && (
                  <span className="shrink-0 text-sm text-stamp">
                    {timing.days === 0 ? "Acaba hoy" : `Acaba en ${timing.days} d`}
                  </span>
                )}
                {!done && timing?.state === "ended" && <span className="shrink-0 text-sm text-ink-soft">Ya terminó</span>}
              </div>
              <p className="truncate text-sm text-ink-soft">{meta}</p>
              <RecommendedBy people={who} className="text-lg" />
              {tags.length > 0 && (
                <ul className="mt-0.5 flex flex-wrap gap-1.5">
                  {tags.map((t) => (
                    <li
                      key={t}
                      className="rounded bg-mustard-soft px-1.5 py-0.5 text-xs text-ink"
                    >
                      {t}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Link>
          <FavoriteStar entryId={entry.id} initial={entry.is_favorite} title={c.title} />
          <button
            type="button"
            onClick={() => toggle(!done)}
            aria-pressed={done}
            aria-label={
              done
                ? `Desmarcar «${c.title}» como ${label.toLowerCase()}`
                : `Marcar «${c.title}» como ${label.toLowerCase()}`
            }
            title={
              done
                ? `Desmarcar ${label.toLowerCase()}`
                : `Marcar como ${label.toLowerCase()}`
            }
            className="grid h-11 w-11 shrink-0 place-items-center"
          >
            <span
              aria-hidden
              className={`grid h-7 w-7 place-items-center rounded-full border-2 text-sm font-bold transition-colors ${
                done
                  ? "border-stamp bg-stamp text-stamp-ink"
                  : "border-rule text-transparent hover:border-stamp"
              }`}
            >
              ✓
            </span>
          </button>
        </div>
        {justChanged && (
          <p
            role="status"
            className="-mt-2 mb-3 flex items-center gap-3 pl-[4.5rem] text-sm text-ink-soft"
          >
            <button
              type="button"
              onClick={() => toggle(!done, true)}
              className="font-semibold text-ink underline underline-offset-4"
            >
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
      </div>
    </li>
  );
}
