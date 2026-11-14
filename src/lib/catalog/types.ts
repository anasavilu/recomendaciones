export const KINDS = ["pelicula", "serie", "documental", "libro", "restaurante", "lugar", "evento", "otro"] as const;
export type Kind = (typeof KINDS)[number];

export const KIND_LABEL: Record<Kind, string> = {
  pelicula: "Película",
  serie: "Serie",
  documental: "Documental",
  libro: "Libro",
  restaurante: "Restaurante",
  lugar: "Otro lugar",
  evento: "Teatro o expo",
  otro: "Otro",
};

export const KIND_PLURAL: Record<Kind, string> = {
  pelicula: "Películas",
  serie: "Series",
  documental: "Documentales",
  libro: "Libros",
  restaurante: "Restaurantes",
  lugar: "Otros lugares",
  evento: "Teatro y expos",
  otro: "Otros",
};

/** Resultado de búsqueda en un catálogo (ligero, para elegir). */
export type Candidate = {
  source: "tmdb" | "google_books" | "openlibrary" | "google_places" | "osm" | "madrid_agenda" | "esmadrid" | "bcn_agenda" | "ticketmaster";
  source_id: string;
  kind: Kind;
  title: string;
  year?: number | null;
  subtitle?: string | null; // autor, dirección, "Serie · 3 temporadas"...
  image_url?: string | null;
};

/** Ficha completa, lista para guardar en catalog_items. */
export type CatalogDetails = {
  kind: Kind;
  source: string;
  source_id: string | null;
  title: string;
  original_title?: string | null;
  year?: number | null;
  creators?: string[];
  genres?: string[];
  summary?: string | null;
  image_url?: string | null;
  address?: string | null;
  links?: Record<string, string>;
  extra?: Record<string, unknown>;
};

export function filmaffinityUrl(title: string) {
  return `https://www.filmaffinity.com/es/search.php?stext=${encodeURIComponent(title)}`;
}
