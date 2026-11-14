import "server-only";
import { cachedFeed, type EventItem } from "./shared";

// Agenda municipal del Ayuntamiento de Madrid: actividades de los próximos 100 días.
// Datos abiertos (datos.madrid.es), JSON-LD con "@graph". Licencia: reutilización citando la fuente.
const URL =
  "https://datos.madrid.es/dataset/206974-0-agenda-eventos-culturales-100/resource/206974-0-agenda-eventos-culturales-100-json/download/206974-0-agenda-eventos-culturales-100.json";

// Tipos que encajan en "Teatro y exposiciones" (el resto: talleres, cursos, deportes… se descartan)
const TYPES: Record<string, string> = {
  TeatroPerformance: "Teatro",
  Exposiciones: "Exposición",
  DanzaBaile: "Danza",
  ComediaMonologo: "Comedia",
  CircoMagia: "Circo y magia",
  Flamenco: "Flamenco",
  Zarzuela: "Zarzuela",
  Musica: "Música",
  JazzSoulFunkySwingReagge: "Música",
  ClasicaEspanola: "Música",
  LatinaEspanola: "Música",
  CoroGospel: "Música",
  CuentacuentosTiteresMarionetas: "Títeres y cuentacuentos",
  CineActividadesAudiovisuales: "Cine",
  CineFiccion: "Cine",
  Festivales: "Festival",
  ProgramacionDestacadaAgendaCultura: "?", // se deduce del título y la descripción
  ActividadesCalleArteUrbano: "Arte urbano",
  Arte: "Arte",
};

type Raw = {
  id: string;
  "@type"?: string;
  title: string;
  description?: string;
  free?: number;
  price?: string;
  dtstart?: string;
  dtend?: string;
  time?: string;
  link?: string;
  "event-location"?: string;
  address?: { area?: { "street-address"?: string; locality?: string } };
  location?: { latitude?: number; longitude?: number };
};

/** Para la "programación destacada", que no dice de qué tipo es. */
function guessType(text: string): string {
  const t = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/exposici|muestra de|fotograf/.test(t)) return "Exposición";
  if (/concierto|musica|orquesta|jazz|coro\b/.test(t)) return "Música";
  if (/danza|ballet|baile/.test(t)) return "Danza";
  if (/cine|pelicula|proyecci|cortometraje|festival de cine/.test(t)) return "Cine";
  if (/teatro|obra|escena|dramaturg|monologo/.test(t)) return "Teatro";
  if (/titere|cuentacuento|marioneta/.test(t)) return "Títeres y cuentacuentos";
  return "Otros";
}

const cap = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase());

export function parseMadrid(json: unknown): EventItem[] {
  const graph = (json as { "@graph"?: Raw[] })["@graph"] ?? [];
  const out: EventItem[] = [];
  for (const r of graph) {
    const t = r["@type"]?.split("/").pop();
    let type = t ? TYPES[t] : undefined;
    if (!type || !r.title) continue;
    if (type === "?") type = guessType(`${r.title} ${r.description ?? ""}`);
    const street = r.address?.area?.["street-address"];
    out.push({
      source: "madrid_agenda",
      id: String(r.id),
      title: r.title.trim(),
      type,
      venue: r["event-location"]?.trim() || null,
      address: street ? cap(street) : null,
      city: "Madrid",
      start: r.dtstart?.slice(0, 10) || null,
      end: r.dtend?.slice(0, 10) || null,
      time: r.time?.trim() || null,
      price: r.free === 1 ? "Gratis" : r.price?.trim() || null,
      description: r.description?.trim() || null,
      url: r.link?.replace(/^http:/, "https:") || null,
      image: null,
      lat: r.location?.latitude ?? null,
      lon: r.location?.longitude ?? null,
    });
  }
  return out;
}

export function madridAgenda() {
  return cachedFeed("madrid_agenda", async () => {
    const res = await fetch(URL, { headers: { "User-Agent": "Recomendados/0.1" } });
    if (!res.ok) throw new Error(`datos.madrid.es ${res.status}`);
    return parseMadrid(await res.json());
  });
}
