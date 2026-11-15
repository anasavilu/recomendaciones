"use client";

import { useTransition } from "react";
import { follow, unfollow } from "@/app/gente/actions";
import type { FollowState } from "@/lib/people";

/** Seguir / Solicitar / Solicitado / Siguiendo */
export function FollowButton({ userId, state, isPublic }: { userId: string; state: FollowState; isPublic: boolean }) {
  const [pending, start] = useTransition();
  const label =
    state === "aceptado" ? "Siguiendo" : state === "pendiente" ? "Solicitud enviada" : isPublic ? "Seguir" : "Solicitar seguir";
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => (state === "nada" ? follow(userId) : unfollow(userId)))}
      title={state === "nada" ? undefined : state === "pendiente" ? "Cancelar la solicitud" : "Dejar de seguir"}
      className={`rounded-full px-4 py-1.5 text-sm font-semibold disabled:opacity-60 ${
        state === "nada" ? "bg-stamp text-stamp-ink" : "border border-rule text-ink"
      }`}
    >
      {pending ? "…" : label}
    </button>
  );
}
