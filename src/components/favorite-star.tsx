"use client";

import { useState } from "react";
import { setFavorite } from "@/app/actions";

/** ★ para marcar como favorito. */
export function FavoriteStar({
  entryId,
  initial,
  title,
  size = "sm",
}: {
  entryId: string;
  initial: boolean;
  title: string;
  size?: "sm" | "lg";
}) {
  const [on, setOn] = useState(initial);
  const [failed, setFailed] = useState(false);

  async function toggle() {
    const next = !on;
    setOn(next);
    setFailed(false);
    try {
      await setFavorite(entryId, next);
    } catch {
      setOn(!next);
      setFailed(true);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? `Quitar «${title}» de favoritos` : `Marcar «${title}» como favorito`}
      title={failed ? "No se ha guardado. Prueba otra vez." : on ? "Quitar de favoritos" : "Marcar como favorito"}
      className={`grid shrink-0 place-items-center ${size === "lg" ? "h-11 w-11 text-2xl" : "h-11 w-9 text-xl"} ${
        on ? "text-mustard" : failed ? "text-stamp" : "text-rule hover:text-mustard"
      }`}
    >
      <span aria-hidden>{on ? "★" : "☆"}</span>
    </button>
  );
}
