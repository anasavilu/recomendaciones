import type { Kind } from "./catalog/types";
import type { EntryRow } from "./entry-format";

/** Filtros por categoría: qué se puede filtrar en cada tipo y con qué nombre. */
export type FacetKey = "genero" | "plataforma";

/** Sin categoría elegida ("Todo"): género o tipo de cualquier cosa, y plataforma */
export const ALL_FACETS: { key: FacetKey; label: string; all: string }[] = [
  { key: "genero", label: "Género o tipo", all: "Todos" },
  { key: "plataforma", label: "Plataforma", all: "Todas las plataformas" },
];

export const FACETS: Partial<Record<Kind, { key: FacetKey; label: string; all: string }[]>> = {
  pelicula: [
    { key: "genero", label: "Género", all: "Todos los géneros" },
    { key: "plataforma", label: "Plataforma", all: "Todas las plataformas" },
  ],
  serie: [
    { key: "genero", label: "Género", all: "Todos los géneros" },
    { key: "plataforma", label: "Plataforma", all: "Todas las plataformas" },
  ],
  documental: [
    { key: "genero", label: "Tema", all: "Todos los temas" },
    { key: "plataforma", label: "Plataforma", all: "Todas las plataformas" },
  ],
  libro: [{ key: "genero", label: "Género", all: "Todos los géneros" }],
  restaurante: [{ key: "genero", label: "Tipo de comida", all: "Todos los tipos" }],
  lugar: [{ key: "genero", label: "Tipo", all: "Todos los tipos" }],
  evento: [{ key: "genero", label: "Tipo", all: "Todos los tipos" }],
};

// Categorías de libros que llegan en inglés (Google Books / Open Library)
const BOOK_GENRE_ES: Record<string, string> = {
  fiction: "Ficción", "juvenile fiction": "Juvenil", "young adult fiction": "Juvenil", "juvenile nonfiction": "Infantil y juvenil",
  // Mismos nombres que usa TMDB para pelis y series, para que en «Todo» se agrupen
  romance: "Romance", "romántica": "Romance", thrillers: "Suspense", thriller: "Suspense", suspense: "Suspense", "mystery & detective": "Misterio",
  mystery: "Misterio", fantasy: "Fantasía", "science fiction": "Ciencia ficción", horror: "Terror", literary: "Literaria",
  historical: "Histórica", "literary collections": "Antologías", "literary criticism": "Crítica literaria",
  poetry: "Poesía", drama: "Teatro", humor: "Humor", "comics & graphic novels": "Cómics",
  biography: "Biografías", "biography & autobiography": "Biografías", memoir: "Memorias", history: "Historia",
  psychology: "Psicología", "self-help": "Autoayuda", philosophy: "Filosofía", science: "Ciencia",
  "business & economics": "Economía y empresa", economics: "Economía", "political science": "Política",
  "social science": "Ciencias sociales", sociology: "Ciencias sociales", anthropology: "Ciencias sociales", "family & relationships": "Familia y relaciones",
  "body, mind & spirit": "Espiritualidad", religion: "Religión", "health & fitness": "Salud",
  medical: "Medicina", education: "Educación", cooking: "Cocina", travel: "Viajes", art: "Arte",
  music: "Música", "performing arts": "Artes escénicas", photography: "Fotografía", architecture: "Arquitectura",
  design: "Diseño", nature: "Naturaleza", "sports & recreation": "Deportes", "technology & engineering": "Tecnología",
  computers: "Informática", mathematics: "Matemáticas", law: "Derecho", "language arts & disciplines": "Lengua",
  "foreign language study": "Idiomas", "true crime": "True crime", "crafts & hobbies": "Manualidades",
  "house & home": "Hogar", gardening: "Jardinería", pets: "Mascotas", parenting: "Crianza",
};

// Géneros de series (a veces sin traducir): se juntan con los de películas
const SCREEN_GENRE_ES: Record<string, string> = {
  "action & adventure": "Acción", "acción y aventura": "Acción", "action and adventure": "Acción",
  "sci-fi & fantasy": "Ciencia ficción", "ciencia ficción y fantasía": "Ciencia ficción",
  "war & politics": "Bélica", "bélica y política": "Bélica", "guerra y política": "Bélica",
  kids: "Infantil", news: "Noticias", reality: "Reality", soap: "Telenovela", talk: "Entrevistas",
  "película de tv": "Telefilme",
};

// En libros de catálogo solo se usan géneros conocidos: las subcategorías de Google y Open Library
// ("Small Town & Rural", "Persian"…) llenaban el filtro de opciones sueltas
const BOOK_KNOWN = new Set(Object.values(BOOK_GENRE_ES));

// Subcategorías de Google Books que no aportan como filtro
const NOISE = new Set([
  "general", "contemporary", "literary fiction", "nonfiction", "non-fiction", "fiction in spanish", "spanish fiction",
  "fiction", "ficción", "literary", "literaria", "literature", "novela", "novel",
]);

const cap = (s: string) => (s ? s[0].toLocaleUpperCase("es") + s.slice(1) : s);

/** Nombre de un género en español (o null si no aporta). */
export function genreLabel(raw: string, kind: Kind = "libro", strict = false): string | null {
  const t = raw.trim();
  const key = t.toLowerCase();
  if (!t || NOISE.has(key)) return null;
  const map = kind === "libro" ? BOOK_GENRE_ES : SCREEN_GENRE_ES;
  const label = map[key] ?? cap(t);
  if (strict && kind === "libro" && !BOOK_KNOWN.has(label)) return null;
  return label;
}

/** "Netflix Standard with Ads" → "Netflix"; "Movistar Plus+ Ficción Total" → "Movistar Plus+". */
const PLATFORMS: [RegExp, string][] = [
  [/^netflix/i, "Netflix"],
  [/^(amazon )?prime video|^amazon video/i, "Amazon Prime Video"],
  [/^movistar/i, "Movistar Plus+"],
  [/^(hbo )?max\b|^hbo/i, "HBO Max"],
  [/^disney/i, "Disney+"],
  [/^apple tv/i, "Apple TV+"],
  [/^skyshowtime/i, "SkyShowtime"],
  [/^filmin/i, "Filmin"],
  [/^rakuten/i, "Rakuten TV"],
  [/^atres ?player/i, "Atresplayer"],
  [/^rtve/i, "RTVE Play"],
  [/^flixol[eé]/i, "FlixOlé"],
  [/^mubi/i, "MUBI"],
];
export function platformLabel(raw: string): string {
  const t = raw.trim();
  for (const [re, name] of PLATFORMS) if (re.test(t)) return name;
  return t.replace(/\s+(with|con) (ads|anuncios)$/i, "");
}
export const platformList = (raw: string[]) => [...new Set(raw.filter(Boolean).map(platformLabel))];

/** "Restaurante español" → "Español"; "Restaurante de sushi" → "Sushi"; "Bar de tapas" se queda igual. */
function foodLabel(raw: string): string | null {
  const t = raw.trim().replace(/^restaurante\s+(de\s+|del\s+)?/i, "");
  if (!t || /^restaurante$/i.test(t)) return null;
  return cap(t);
}

/** Valores de un filtro para una entrada de la lista. */
export function facetValues(entry: Pick<EntryRow, "catalog_items">, key: FacetKey): string[] {
  const c = entry.catalog_items;
  if (key === "plataforma") return platformList((c.extra?.streaming_es as string[] | undefined) ?? []);

  const genres = c.genres ?? [];
  let out: (string | null)[];
  if (c.kind === "restaurante") out = genres.map(foodLabel);
  else if (c.kind === "lugar" || c.kind === "evento") out = genres.slice(0, 1).map((g) => cap(g.trim()) || null);
  else out = genres.map((g) => genreLabel(g, c.kind, c.source === "google_books" || c.source === "openlibrary"));
  // En documentales, "Documental" es redundante
  if (c.kind === "documental") out = out.filter((g) => g !== "Documental");
  return [...new Set(out.filter((g): g is string => Boolean(g)))];
}

/** Opciones de un filtro a partir de lo guardado, con cuántas entradas tiene cada una. */
export function facetOptions(entries: EntryRow[], key: FacetKey): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const e of entries) for (const v of facetValues(e, key)) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, "es"));
}
