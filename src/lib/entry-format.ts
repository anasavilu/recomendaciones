import type { Kind } from "./catalog/types";

/** Tipos y formatos de las entradas que se usan tanto en el servidor como en el navegador. */

export type Status = "pendiente" | "en_curso" | "hecho" | "descartado";

export type EntryRow = {
  id: string;
  status: Status;
  rating: number | null;
  /** 👍 true · 👎 false · sin valorar null */
  would_recommend: boolean | null;
  notes: string | null;
  created_at: string;
  catalog_items: {
    id: string;
    kind: Kind;
    source: string;
    title: string;
    original_title: string | null;
    year: number | null;
    creators: string[];
    genres: string[];
    summary: string | null;
    image_url: string | null;
    address: string | null;
    links: Record<string, string>;
    extra: Record<string, unknown>;
  };
  entry_tags: { tags: { id: string; name: string } }[];
  entry_recommendations: {
    comment: string | null;
    recommenders: { id: string; name: string; linked: { username: string | null } | null };
  }[];
};

export const ENTRY_SELECT =
  "id,status,rating,would_recommend,notes,created_at,catalog_items(*),entry_tags(tags(id,name)),entry_recommendations(comment,recommenders(id,name,linked:profiles!recommenders_linked_profile_id_fkey(username)))";

/** Persona que recomienda, tal como se muestra y como se envía en los formularios. */
export type Person = { token: string; name: string; username: string | null };

export function personOf(r: EntryRow["entry_recommendations"][number]["recommenders"]): Person {
  const username = r.linked?.username ?? null;
  return { token: username ? `@${username}` : r.name, name: r.name, username };
}

export const STATUS_LABEL: Record<Status, string> = {
  pendiente: "Pendiente",
  en_curso: "Empezado",
  hecho: "Hecho",
  descartado: "Descartado",
};

export function doneLabel(kind: Kind) {
  return kind === "libro" ? "Leído" : kind === "restaurante" ? "Ido" : "Visto";
}

