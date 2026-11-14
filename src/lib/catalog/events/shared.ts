import type { Candidate, CatalogDetails } from "../types";

/** Un evento normalizado, venga de la fuente que venga. */
export type EventItem = {
  source: "madrid_agenda" | "esmadrid" | "bcn_agenda" | "ticketmaster";
  id: string;
  title: string;
  type: string | null; // "Teatro", "Exposición"…
  venue: string | null;
  address: string | null;
  city: string | null;
  start: string | null; // AAAA-MM-DD
  end: string | null; // AAAA-MM-DD
  time: string | null; // "19:00"
  price: string | null; // "Gratis", "Desde 18 €"…
  description: string | null;
  url: string | null;
  image: string | null;
  lat: number | null;
  lon: number | null;
};

export const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

const STOP = new Set("el la los las un una de del al y e en a con por para the".split(" "));
export const terms = (q: string) => norm(q).split(" ").filter((t) => t.length > 1 && !STOP.has(t));

const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" }); // AAAA-MM-DD

/** ¿Sigue en cartel? (sin fecha de fin, se usa la de inicio) */
export function isCurrent(e: EventItem) {
  const last = e.end ?? e.start;
  return !last || last >= today();
}

/** Todas las palabras buscadas en título, sala, tipo o ciudad. */
export function matches(e: EventItem, qTerms: string[]) {
  const doc = norm([e.title, e.venue, e.type, e.city].filter(Boolean).join(" "));
  return qTerms.every((t) => doc.includes(t));
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"];
/** "2026-07-21" → "21 jul 2026" (sin año si es este año). */
export function shortDate(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  const thisYear = new Date().getFullYear();
  return `${day} ${MONTHS[m - 1]}${y !== thisYear ? ` ${y}` : ""}`;
}

/** "Del 21 jul al 31 ene 2027", "El 13 nov", "Hasta 31 ene"… */
export function dateRange(start: string | null, end: string | null) {
  if (start && end && start !== end) {
    // Si empieza y acaba el mismo año (y no es este), el año solo al final
    const sameYear = start.slice(0, 4) === end.slice(0, 4);
    const from = sameYear ? shortDate(start).replace(/ \d{4}$/, "") : shortDate(start);
    return `Del ${from} al ${shortDate(end)}`;
  }
  if (start) return `El ${shortDate(start)}`;
  if (end) return `Hasta ${shortDate(end)}`;
  return null;
}

export function toCandidate(e: EventItem): Candidate {
  return {
    source: e.source,
    source_id: e.id,
    kind: "evento",
    title: e.title,
    year: null,
    subtitle: [e.type, e.venue, dateRange(e.start, e.end)].filter(Boolean).join(", ") || null,
    image_url: e.image,
  };
}

export function toDetails(e: EventItem): CatalogDetails {
  return {
    kind: "evento",
    source: e.source,
    source_id: e.id,
    title: e.title,
    year: e.start ? Number(e.start.slice(0, 4)) : null,
    genres: e.type ? [e.type] : [],
    summary: e.description,
    image_url: e.image,
    address: [e.venue, e.address].filter(Boolean).join(", ") || null,
    links: {
      ...(e.url ? { web: e.url } : {}),
      ...(e.venue
        ? { maps: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([e.venue, e.address, e.city].filter(Boolean).join(" "))}` }
        : {}),
    },
    extra: {
      venue: e.venue,
      city: e.city,
      start: e.start,
      end: e.end,
      time: e.time,
      price: e.price,
      lat: e.lat,
      lon: e.lon,
    },
  };
}

/** Descarga con caché en memoria (las agendas son ficheros completos que cambian a diario). */
const cache = new Map<string, { at: number; items: EventItem[] }>();
const inflight = new Map<string, Promise<EventItem[]>>();
const TTL = 6 * 3600 * 1000;

export async function cachedFeed(key: string, load: () => Promise<EventItem[]>): Promise<EventItem[]> {
  const hit = cache.get(key);
  if (hit && hit.at > Date.now() - TTL) return hit.items;
  if (inflight.has(key)) return inflight.get(key)!;
  const p = load()
    .then((items) => {
      cache.set(key, { at: Date.now(), items });
      return items;
    })
    .catch((e) => {
      console.warn(`[eventos] No se pudo cargar ${key}:`, (e as Error).message);
      // Si falla, seguir con lo último que tuviéramos
      return hit?.items ?? [];
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
