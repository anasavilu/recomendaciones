import "server-only";
import type { Candidate, CatalogDetails } from "../types";
import { esMadridAgenda } from "./esmadrid";
import { madridAgenda } from "./madrid";
import { barcelonaSearch, barcelonaById } from "./barcelona";
import { isCurrent, matches, norm, terms, toCandidate, toDetails, type EventItem } from "./shared";

const CACHE_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; results: EventItem[] }>();

/**
 * Busca obras, exposiciones y espectáculos en cartel en todas las agendas.
 * Las de Madrid se descargan enteras (con caché); Barcelona se consulta a su buscador.
 */
export async function searchEventItems(q: string): Promise<EventItem[]> {
  const key = q.trim().toLowerCase();
  const hit = cache.get(key);
  if (hit && hit.at > Date.now() - CACHE_MS) return hit.results;

  const t = terms(q);
  if (!t.length) return [];
  const [es, mad, bcn] = await Promise.all([
    esMadridAgenda(),
    madridAgenda(),
    barcelonaSearch(q).catch((e) => {
      console.warn("[eventos] Barcelona no responde:", (e as Error).message);
      return [] as EventItem[];
    }),
  ]);
  // esMadrid primero: trae foto y precio. Una misma obra/expo en dos agendas sale una vez.
  const seen = new Set<string>();
  const results: EventItem[] = [];
  for (const e of [...es, ...mad, ...bcn]) {
    if (!isCurrent(e) || !matches(e, t)) continue;
    const k = `${norm(e.title)}|${e.end ?? e.start}`;
    if (seen.has(k)) continue;
    seen.add(k);
    results.push(e);
  }
  // Primero lo que coincide en el título, luego lo que acaba antes
  results.sort((a, b) => {
    const at = matches({ ...a, venue: null, type: null, city: null }, t) ? 0 : 1;
    const bt = matches({ ...b, venue: null, type: null, city: null }, t) ? 0 : 1;
    return at - bt || (a.end ?? a.start ?? "").localeCompare(b.end ?? b.start ?? "");
  });
  cache.set(key, { at: Date.now(), results });
  return results;
}

export async function searchEvents(q: string): Promise<Candidate[]> {
  return (await searchEventItems(q)).slice(0, 10).map(toCandidate);
}

export async function eventDetails(source: string, id: string): Promise<CatalogDetails> {
  let item: EventItem | undefined;
  if (source === "esmadrid") item = (await esMadridAgenda()).find((e) => e.id === id);
  else if (source === "madrid_agenda") item = (await madridAgenda()).find((e) => e.id === id);
  else if (source === "bcn_agenda") item = await barcelonaById(id);
  if (!item) throw new Error("Evento no encontrado en la agenda");
  return toDetails(item);
}
