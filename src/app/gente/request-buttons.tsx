"use client";

import { useTransition } from "react";
import { acceptFollower, removeFollower } from "./actions";

/** Aceptar o rechazar una solicitud; o quitar a un seguidor. */
export function RequestButtons({ userId, pending = false }: { userId: string; pending?: boolean }) {
  const [busy, start] = useTransition();
  return (
    <span className="flex shrink-0 items-center gap-3">
      {pending && (
        <button
          type="button"
          disabled={busy}
          onClick={() => start(() => acceptFollower(userId))}
          className="rounded-full bg-stamp px-3 py-1 text-sm font-semibold text-stamp-ink disabled:opacity-60"
        >
          Aceptar
        </button>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => start(() => removeFollower(userId))}
        className="text-sm text-ink-soft underline underline-offset-4 disabled:opacity-60"
      >
        {pending ? "Rechazar" : "Quitar"}
      </button>
    </span>
  );
}
