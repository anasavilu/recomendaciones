import "server-only";
import { type Candidate, type CatalogDetails, type Kind, filmaffinityUrl } from "./types";

const API = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p/w342";
const DOCUMENTARY_GENRE = 99;

function enabled() {
  return Boolean(process.env.TMDB_READ_TOKEN);
}

async function tmdb<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(API + path);
  url.searchParams.set("language", "es-ES");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.TMDB_READ_TOKEN}`, accept: "application/json" },
  });
  if (!res.ok) throw new Error(`TMDB ${res.status} en ${path}`);
  return res.json() as Promise<T>;
}

type MultiResult = {
  id: number;
  media_type: "movie" | "tv" | "person";
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  genre_ids?: number[];
  original_language?: string;
};

const yearOf = (d?: string) => (d && d.length >= 4 ? Number(d.slice(0, 4)) : null);

export async function searchTmdb(q: string, only?: Kind): Promise<Candidate[]> {
  if (!enabled()) return [];
  const data = await tmdb<{ results: MultiResult[] }>("/search/multi", { query: q, include_adult: "false" });
  return data.results
    .filter((r) => r.media_type === "movie" || r.media_type === "tv")
    .map((r): Candidate => {
      const isDoc = r.genre_ids?.includes(DOCUMENTARY_GENRE);
      const kind: Kind = isDoc ? "documental" : r.media_type === "movie" ? "pelicula" : "serie";
      return {
        source: "tmdb",
        source_id: `${r.media_type}:${r.id}`,
        kind,
        title: (r.title ?? r.name)!,
        year: yearOf(r.release_date ?? r.first_air_date),
        subtitle: r.media_type === "tv" ? (isDoc ? "Serie documental" : "Serie") : isDoc ? "Documental" : "Película",
        image_url: r.poster_path ? IMG + r.poster_path : null,
      };
    })
    .filter((c) => !only || c.kind === only)
    .slice(0, 10);
}

type Details = {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
  overview?: string;
  poster_path?: string | null;
  genres: { id: number; name: string }[];
  runtime?: number;
  number_of_seasons?: number;
  created_by?: { name: string }[];
  credits?: { crew: { job: string; name: string }[]; cast: { name: string }[] };
  "watch/providers"?: { results?: Record<string, { flatrate?: { provider_name: string }[]; link?: string }> };
};

export async function tmdbDetails(sourceId: string): Promise<CatalogDetails> {
  const [media, id] = sourceId.split(":");
  if (media !== "movie" && media !== "tv") throw new Error("Id de TMDB no válido");
  const d = await tmdb<Details>(`/${media}/${id}`, { append_to_response: "credits,watch/providers" });

  const isDoc = d.genres.some((g) => g.id === DOCUMENTARY_GENRE);
  const kind: Kind = isDoc ? "documental" : media === "movie" ? "pelicula" : "serie";
  const title = (d.title ?? d.name)!;
  const creators =
    media === "movie"
      ? (d.credits?.crew ?? []).filter((c) => c.job === "Director").map((c) => c.name)
      : (d.created_by ?? []).map((c) => c.name);
  const es = d["watch/providers"]?.results?.ES;

  return {
    kind,
    source: "tmdb",
    source_id: sourceId,
    title,
    original_title: d.original_title ?? d.original_name ?? null,
    year: yearOf(d.release_date ?? d.first_air_date),
    creators,
    genres: d.genres.map((g) => g.name),
    summary: d.overview || null,
    image_url: d.poster_path ? IMG + d.poster_path : null,
    links: {
      tmdb: `https://www.themoviedb.org/${media}/${d.id}`,
      ...(media === "movie" || media === "tv" ? { filmaffinity: filmaffinityUrl(title) } : {}),
      ...(es?.link ? { donde_ver: es.link } : {}),
    },
    extra: {
      cast: (d.credits?.cast ?? []).slice(0, 5).map((c) => c.name),
      runtime: d.runtime ?? null,
      seasons: d.number_of_seasons ?? null,
      streaming_es: (es?.flatrate ?? []).map((p) => p.provider_name),
    },
  };
}
