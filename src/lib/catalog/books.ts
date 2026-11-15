import "server-only";
import type { Candidate, CatalogDetails } from "./types";
import { asIsbn, rankBooks, type BookHit } from "./book-ranking";
import { genreLabel } from "../facets";

const API = "https://www.googleapis.com/books/v1/volumes";

type Volume = {
  id: string;
  volumeInfo: {
    title: string;
    subtitle?: string;
    authors?: string[];
    publishedDate?: string;
    description?: string;
    categories?: string[];
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
    infoLink?: string;
    pageCount?: number;
    averageRating?: number;
    ratingsCount?: number;
    industryIdentifiers?: { type: string; identifier: string }[];
    language?: string;
  };
};

const https = (u?: string) => (u ? u.replace(/^http:/, "https:") : null);
const yearOf = (d?: string) => (d && /^\d{4}/.test(d) ? Number(d.slice(0, 4)) : null);
const withKey = (url: URL) => {
  if (process.env.GOOGLE_BOOKS_API_KEY) url.searchParams.set("key", process.env.GOOGLE_BOOKS_API_KEY);
  return url;
};

// Caché en memoria para no gastar cupo de Google repitiendo la misma búsqueda
const CACHE_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; results: Candidate[] }>();

export async function searchBooks(q: string): Promise<Candidate[]> {
  const isbn = asIsbn(q);
  const key = q.trim().toLowerCase();
  const cached = cache.get(key);
  if (cached && cached.at > Date.now() - CACHE_MS) return cached.results;

  const query = isbn ? `isbn:${isbn}` : q;
  // Primero ediciones en español; solo si no basta, una segunda búsqueda sin filtro de idioma
  const es = await searchGoogleBooks(query, "es");
  const enoughEs = (es ?? []).filter((b) => b.authors.length).length >= 3;
  const any = es !== null && !enoughEs ? await searchGoogleBooks(query) : null;
  const google = es === null && any === null ? null : [...(es ?? []), ...(any ?? [])];

  // Si Google falla o da pocas fichas con autor, completamos con Open Library
  const goodGoogle = (google ?? []).filter((b) => b.authors.length).length;
  const extra = google === null || goodGoogle < 3 ? await searchOpenLibrary(q) : [];

  const results = rankBooks([...(google ?? []), ...extra], isbn ? "" : q).map(toCandidate);
  if (google !== null) cache.set(key, { at: Date.now(), results });
  return results;
}

function toCandidate(b: BookHit): Candidate {
  return {
    source: b.source,
    source_id: b.source_id,
    kind: "libro",
    title: b.title,
    year: b.year,
    subtitle: b.authors.length ? b.authors.join(", ") : "Autor desconocido",
    image_url: b.image_url,
  };
}

/** null si Google Books no responde o agota el cupo. */
async function searchGoogleBooks(q: string, lang?: string): Promise<BookHit[] | null> {
  const url = withKey(new URL(API));
  url.searchParams.set("q", q);
  if (lang) url.searchParams.set("langRestrict", lang);
  url.searchParams.set("country", "ES");
  url.searchParams.set("maxResults", "30");
  url.searchParams.set("printType", "books");
  url.searchParams.set("orderBy", "relevance");
  const res = await fetch(url).catch((e) => {
    console.warn("[libros] Google Books no responde:", (e as Error).message);
    return null;
  });
  if (!res) return null;
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.warn(
      `[libros] Google Books respondió ${res.status}${res.status === 429 ? " (cupo agotado: falta GOOGLE_BOOKS_API_KEY o se ha pasado del límite diario)" : ""}`,
      body.slice(0, 200),
    );
    return null;
  }
  const data = (await res.json()) as { items?: Volume[] };
  return (data.items ?? []).map((v) => {
    const i = v.volumeInfo;
    const image = https(i.imageLinks?.thumbnail ?? i.imageLinks?.smallThumbnail);
    return {
      source: "google_books",
      source_id: v.id,
      kind: "libro",
      title: i.subtitle ? `${i.title}: ${i.subtitle}` : i.title,
      year: yearOf(i.publishedDate),
      authors: i.authors ?? [],
      language: i.language ?? null,
      hasCover: Boolean(image),
      image_url: image,
    };
  });
}

export async function bookDetails(id: string): Promise<CatalogDetails> {
  const res = await fetch(withKey(new URL(`${API}/${encodeURIComponent(id)}`)));
  if (!res.ok) throw new Error(`Google Books ${res.status}`);
  const v = (await res.json()) as Volume;
  const i = v.volumeInfo;
  // Las categorías de Google vienen tipo "Fiction / Romance / Contemporary"
  const genres = [
    ...new Set(
      (i.categories ?? [])
        .flatMap((c) => c.split("/"))
        .map((s) => genreLabel(s))
        .filter((g): g is string => Boolean(g)),
    ),
  ];
  const isbn = i.industryIdentifiers?.find((x) => x.type === "ISBN_13")?.identifier ?? null;
  const rating =
    i.averageRating && (i.ratingsCount ?? 0) >= MIN_VOTES
      ? { book_rating: i.averageRating, book_votes: i.ratingsCount, book_rating_source: "Google Books" }
      : isbn
        ? await openLibraryRatingByIsbn(isbn)
        : {};
  return {
    kind: "libro",
    source: "google_books",
    source_id: v.id,
    title: i.subtitle ? `${i.title}: ${i.subtitle}` : i.title,
    year: yearOf(i.publishedDate),
    creators: i.authors ?? [],
    genres,
    summary: i.description ? i.description.replace(/<[^>]+>/g, "") : null,
    image_url: https(i.imageLinks?.thumbnail),
    links: i.infoLink ? { google_books: i.infoLink } : {},
    extra: {
      pages: i.pageCount ?? null,
      isbn,
      language: i.language ?? null,
      ...rating,
      book_rated_at: new Date().toISOString(),
    },
  };
}

/** Respaldo y complemento de Google Books. */
async function searchOpenLibrary(q: string): Promise<BookHit[]> {
  const url = new URL("https://openlibrary.org/search.json");
  url.searchParams.set("q", q);
  url.searchParams.set("limit", "20");
  url.searchParams.set("lang", "es");
  url.searchParams.set("fields", "key,title,author_name,first_publish_year,cover_i,language");
  const res = await fetch(url, { headers: { "User-Agent": "Recomendados/0.1" } }).catch(() => null);
  if (!res?.ok) return [];
  const data = (await res.json()) as {
    docs: { key: string; title: string; author_name?: string[]; first_publish_year?: number; cover_i?: number; language?: string[] }[];
  };
  return data.docs.map((d) => ({
    source: "openlibrary",
    source_id: d.key,
    kind: "libro",
    title: d.title,
    year: d.first_publish_year ?? null,
    authors: d.author_name ?? [],
    language: d.language?.includes("spa") ? "es" : null,
    hasCover: Boolean(d.cover_i),
    image_url: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : null,
  }));
}

export async function openLibraryDetails(key: string): Promise<CatalogDetails> {
  if (!/^\/works\/OL\w+$/.test(key)) throw new Error("Id de Open Library no válido");
  const res = await fetch(`https://openlibrary.org${key}.json`, { headers: { "User-Agent": "Recomendados/0.1" } });
  if (!res.ok) throw new Error(`Open Library ${res.status}`);
  const w = (await res.json()) as {
    title: string;
    description?: string | { value: string };
    subjects?: string[];
    covers?: number[];
    authors?: { author: { key: string } }[];
    first_publish_date?: string;
  };
  const authors = await Promise.all(
    (w.authors ?? []).slice(0, 3).map(async (a) => {
      const r = await fetch(`https://openlibrary.org${a.author.key}.json`);
      return r.ok ? ((await r.json()) as { name: string }).name : null;
    }),
  );
  return {
    kind: "libro",
    source: "openlibrary",
    source_id: key,
    title: w.title,
    year: yearOf(w.first_publish_date),
    creators: authors.filter((a): a is string => Boolean(a)),
    genres: [...new Set((w.subjects ?? []).slice(0, 8).map((s) => genreLabel(s)).filter((g): g is string => Boolean(g)))].slice(0, 5),
    summary: typeof w.description === "string" ? w.description : (w.description?.value ?? null),
    image_url: w.covers?.[0] ? `https://covers.openlibrary.org/b/id/${w.covers[0]}-L.jpg` : null,
    links: { openlibrary: `https://openlibrary.org${key}` },
    extra: { ...(await openLibraryRating(key)), book_rated_at: new Date().toISOString() },
  };
}

// Nota de lectores: con menos valoraciones no es fiable
const MIN_VOTES = 5;
const OL_HEADERS = { "User-Agent": "Recomendados/0.1" };

/** Nota media de los lectores de Open Library (sobre 5), si hay suficientes valoraciones. */
async function openLibraryRating(workKey: string): Promise<Record<string, unknown>> {
  try {
    const r = await fetch(`https://openlibrary.org${workKey}/ratings.json`, { headers: OL_HEADERS, signal: AbortSignal.timeout(4000) });
    if (!r.ok) return {};
    const d = (await r.json()) as { summary?: { average?: number | null; count?: number } };
    const avg = d.summary?.average;
    const count = d.summary?.count ?? 0;
    return avg && count >= MIN_VOTES ? { book_rating: avg, book_votes: count, book_rating_source: "Open Library" } : {};
  } catch {
    return {};
  }
}

async function openLibraryRatingByIsbn(isbn: string): Promise<Record<string, unknown>> {
  try {
    const r = await fetch(`https://openlibrary.org/isbn/${encodeURIComponent(isbn)}.json`, { headers: OL_HEADERS, signal: AbortSignal.timeout(4000) });
    if (!r.ok) return {};
    const work = ((await r.json()) as { works?: { key: string }[] }).works?.[0]?.key;
    return work && /^\/works\/OL\w+$/.test(work) ? openLibraryRating(work) : {};
  } catch {
    return {};
  }
}
