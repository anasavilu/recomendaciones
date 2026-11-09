import "server-only";
import type { Candidate, CatalogDetails } from "./types";
import { asIsbn, rankBooks, type BookHit } from "./book-ranking";

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

export async function searchBooks(q: string): Promise<Candidate[]> {
  const isbn = asIsbn(q);
  const google = await searchGoogleBooks(isbn ? `isbn:${isbn}` : q);

  // Si Google no da suficientes fichas con autor, completamos con Open Library
  const goodGoogle = (google ?? []).filter((b) => b.authors.length).length;
  const extra = google === null || goodGoogle < 3 ? await searchOpenLibrary(q) : [];

  return rankBooks([...(google ?? []), ...extra]).map(toCandidate);
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
async function searchGoogleBooks(q: string): Promise<BookHit[] | null> {
  const url = withKey(new URL(API));
  url.searchParams.set("q", q);
  url.searchParams.set("maxResults", "30");
  url.searchParams.set("printType", "books");
  url.searchParams.set("orderBy", "relevance");
  const res = await fetch(url).catch(() => null);
  if (!res?.ok) return null;
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
  const genres = [...new Set((i.categories ?? []).flatMap((c) => c.split("/").map((s) => s.trim())))];
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
      isbn: i.industryIdentifiers?.find((x) => x.type === "ISBN_13")?.identifier ?? null,
      language: i.language ?? null,
    },
  };
}

/** Respaldo y complemento de Google Books. */
async function searchOpenLibrary(q: string): Promise<BookHit[]> {
  const url = new URL("https://openlibrary.org/search.json");
  url.searchParams.set("q", q);
  url.searchParams.set("limit", "10");
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
    genres: (w.subjects ?? []).slice(0, 5),
    summary: typeof w.description === "string" ? w.description : (w.description?.value ?? null),
    image_url: w.covers?.[0] ? `https://covers.openlibrary.org/b/id/${w.covers[0]}-L.jpg` : null,
    links: { openlibrary: `https://openlibrary.org${key}` },
  };
}
