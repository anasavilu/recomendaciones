import "server-only";
import { XMLParser } from "fast-xml-parser";
import { cachedFeed, type EventItem } from "./shared";

// Agenda turística de la ciudad de Madrid (esmadrid.com), datos abiertos del Ayuntamiento.
// Incluye teatros privados, musicales, grandes exposiciones y conciertos.
const URL = "https://www.esmadrid.com/opendata/agenda_v1_es.xml";

// Categorías que entran en "Teatro y exposiciones" (se descartan deporte, ferias, eventos de ciudad…)
const CATEGORIES: Record<string, string> = { "Teatro y danza": "Teatro", Exposiciones: "Exposición", Música: "Música" };
// Subcategorías más concretas que la categoría
const SUB: Record<string, string> = {
  Musical: "Musical",
  "Danza moderna": "Danza",
  "Danza clásica": "Danza",
  Flamenco: "Flamenco",
  Ópera: "Ópera",
  Zarzuela: "Zarzuela",
  Circo: "Circo y magia",
  Magia: "Circo y magia",
  Comedia: "Comedia",
  Humor: "Comedia",
};

const decode = (s: string) =>
  s
    .replace(/<\/p>\s*<p>/gi, " · ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&([a-z])(acute|grave|uml|circ|tilde|cedil);/gi, (_m, l: string, k: string) =>
      (l + ({ acute: "́", grave: "̀", uml: "̈", circ: "̂", tilde: "̃", cedil: "̧" } as Record<string, string>)[k]).normalize("NFC"),
    )
    .replace(/&(ldquo|rdquo|laquo|raquo|lsquo|rsquo|ndash|mdash|hellip|middot|deg|iexcl|iquest|ordf|ordm|euro);/g, (_m, k: string) =>
      ({ ldquo: "“", rdquo: "”", laquo: "«", raquo: "»", lsquo: "‘", rsquo: "’", ndash: "–", mdash: "—", hellip: "…", middot: "·", deg: "°", iexcl: "¡", iquest: "¿", ordf: "ª", ordm: "º", euro: "€" } as Record<string, string>)[k],
    )
    .replace(/&iexcl;/g, "¡")
    .replace(/&iquest;/g, "¿")
    .replace(/&ordf;/g, "ª")
    .replace(/&ordm;/g, "º")
    .replace(/&euro;/g, "€")
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, " ")
    .replace(/(\s*·\s*)+$/, "")
    .trim();

const arr = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
type Item = { "@_name": string; "#text"?: string | number };
const item = (list: unknown, name: string) => {
  const it = arr(list as Item | Item[]).find((i) => i["@_name"] === name);
  return it?.["#text"] !== undefined ? String(it["#text"]) : "";
};
/** "29/11/2026" → "2026-11-29" */
const iso = (d: string) => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(d.trim());
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
};
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Service = any;

export function parseEsMadrid(xml: string): EventItem[] {
  const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false, cdataPropName: false, trimValues: true });
  const doc = parser.parse(xml);
  const out: EventItem[] = [];
  for (const s of arr<Service>(doc?.serviceList?.service)) {
    const ex = s.extradata ?? {};
    const cats = arr<Service>(ex.categorias?.categoria);
    const catNames = cats.map((c) => item(c.item, "Categoria"));
    const main = catNames.find((c) => CATEGORIES[c]);
    if (!main) continue;
    const subs = cats.flatMap((c) => arr<Service>(c.subcategorias?.subcategoria).map((sc) => item(sc.item, "SubCategoria")));
    const type = subs.map((x) => SUB[x]).find(Boolean) ?? CATEGORIES[main];

    // Fechas: puede haber varios rangos; se toma del primero al último
    const ranges = arr<Service>(ex.fechas?.rango);
    const starts = ranges.map((r) => iso(String(r.inicio ?? ""))).filter((d): d is string => Boolean(d)).sort();
    const ends = ranges.map((r) => iso(String(r.fin ?? ""))).filter((d): d is string => Boolean(d)).sort();

    const b = s.basicData ?? {};
    const g = s.geoData ?? {};
    const title = decode(String(b.title || b.name || ""));
    if (!title) continue;
    const street = decode(String(g.address ?? "")).replace(/\s+,/g, ",");
    const media = arr<Service>(s.multimedia?.media).find((m) => m["@_type"] === "image");
    const lat = Number(g.latitude);
    const lon = Number(g.longitude);
    const price = decode(item(ex.item, "Servicios de pago"));
    const hours = decode(item(ex.item, "Horario"));
    const body = decode(String(b.body ?? ""));

    out.push({
      source: "esmadrid",
      id: String(s["@_id"]),
      title,
      type,
      venue: decode(String(b.nombrert ?? "")) || null,
      address: street ? cap(street) : null,
      city: "Madrid",
      start: starts[0] ?? null,
      end: ends[ends.length - 1] ?? starts[starts.length - 1] ?? null,
      time: hours || null,
      price: price || null,
      description: body ? body.slice(0, 600) : null,
      url: String(b.web ?? "") || null,
      image: media?.url ? String(media.url) : null,
      lat: Number.isFinite(lat) && lat !== 0 ? lat : null,
      lon: Number.isFinite(lon) && lon !== 0 ? lon : null,
    });
  }
  return out;
}

export function esMadridAgenda() {
  return cachedFeed("esmadrid", async () => {
    const res = await fetch(URL, { headers: { "User-Agent": "Recomendados/0.1" } });
    if (!res.ok) throw new Error(`esmadrid.com ${res.status}`);
    return parseEsMadrid(await res.text());
  });
}
