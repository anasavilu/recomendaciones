import "server-only";
import { type Candidate, type CatalogDetails, type Kind, filmaffinityUrl } from "./types";
import { genreLabel } from "../facets";

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
  vote_average?: number;
  vote_count?: number;
  imdb_id?: string | null;
  external_ids?: { imdb_id?: string | null };
};

export async function tmdbDetails(sourceId: string): Promise<CatalogDetails> {
  const [media, id] = sourceId.split(":");
  if (media !== "movie" && media !== "tv") throw new Error("Id de TMDB no válido");
  const d = await tmdb<Details>(`/${media}/${id}`, { append_to_response: "credits,watch/providers,external_ids" });

  const isDoc = d.genres.some((g) => g.id === DOCUMENTARY_GENRE);
  const kind: Kind = isDoc ? "documental" : media === "movie" ? "pelicula" : "serie";
  const title = (d.title ?? d.name)!;
  const creators =
    media === "movie"
      ? (d.credits?.crew ?? []).filter((c) => c.job === "Director").map((c) => c.name)
      : (d.created_by ?? []).map((c) => c.name);
  const es = d["watch/providers"]?.results?.ES;
  const imdb = d.imdb_id ?? d.external_ids?.imdb_id ?? null;

  return {
    kind,
    source: "tmdb",
    source_id: sourceId,
    title,
    original_title: d.original_title ?? d.original_name ?? null,
    year: yearOf(d.release_date ?? d.first_air_date),
    creators,
    genres: d.genres.map((g) => genreLabel(g.name, kind) ?? g.name),
    summary: d.overview || null,
    image_url: d.poster_path ? IMG + d.poster_path : null,
    links: {
      tmdb: `https://www.themoviedb.org/${media}/${d.id}`,
      ...(media === "movie" || media === "tv" ? { filmaffinity: filmaffinityUrl(title) } : {}),
      ...(es?.link ? { donde_ver: es.link } : {}),
      ...(imdb && /^tt\d+$/.test(imdb) ? { imdb: `https://www.imdb.com/title/${imdb}/` } : {}),
    },
    extra: {
      cast: (d.credits?.cast ?? []).slice(0, 5).map((c) => c.name),
      runtime: d.runtime ?? null,
      seasons: d.number_of_seasons ?? null,
      streaming_es: (es?.flatrate ?? []).map((p) => p.provider_name),
      // Nota de los usuarios de TMDB (solo si tiene votos suficientes para ser fiable)
      tmdb_rating: d.vote_count && d.vote_count >= 20 ? Math.round((d.vote_average ?? 0) * 10) / 10 : null,
      tmdb_votes: d.vote_count ?? 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Disponibilidad en plataformas (España). Datos de JustWatch servidos por TMDB.
// ---------------------------------------------------------------------------

type Media = "movie" | "tv";
const DAY = 24 * 3600 * 1000;
const listCache = new Map<string, { at: number; data: unknown }>();

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = listCache.get(key);
  if (hit && hit.at > Date.now() - DAY) return hit.data as T;
  const data = await load();
  listCache.set(key, { at: Date.now(), data });
  return data;
}

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Plataformas disponibles en España, con su id de TMDB. */
async function providersES(media: Media) {
  return cached(`providers:${media}`, async () => {
    const d = await tmdb<{ results: { provider_id: number; provider_name: string }[] }>(`/watch/providers/${media}`, {
      watch_region: "ES",
    });
    return d.results;
  });
}

async function genresES(media: Media) {
  return cached(`genres:${media}`, async () => (await tmdb<{ genres: { id: number; name: string }[] }>(`/genre/${media}/list`)).genres);
}

/** "netflix" → Netflix; "prime" → Amazon Prime Video; "hbo"/"max" → Max… */
async function findProvider(media: Media, name: string) {
  const list = await providersES(media);
  const n = plain(name).replace(/^(hbo)$/, "max");
  return (
    list.find((p) => plain(p.provider_name) === n) ??
    list.find((p) => plain(p.provider_name).startsWith(n)) ??
    list.find((p) => plain(p.provider_name).includes(n) && !/channel|withads|conanuncios/.test(plain(p.provider_name)))
  );
}

export type OnPlatform = { titulo: string; año: number | null; tipo: "película" | "serie"; generos: string[]; sinopsis: string };

/** Lo más popular ahora en una plataforma en España, con filtro de géneros opcional. */
export async function discoverOnPlatform(opts: {
  plataforma: string;
  tipo: "pelicula" | "serie";
  generos?: string[];
}): Promise<{ plataforma: string | null; resultados: OnPlatform[]; aviso?: string }> {
  if (!enabled()) return { plataforma: null, resultados: [], aviso: "Catálogo de pelis no configurado." };
  const media: Media = opts.tipo === "serie" ? "tv" : "movie";
  const provider = await findProvider(media, opts.plataforma);
  if (!provider) {
    const names = (await providersES(media)).slice(0, 25).map((p) => p.provider_name).join(", ");
    return { plataforma: null, resultados: [], aviso: `No encuentro la plataforma «${opts.plataforma}». Algunas disponibles: ${names}.` };
  }
  const allGenres = await genresES(media);
  const genreIds = (opts.generos ?? [])
    .map((g) => allGenres.find((x) => plain(x.name).includes(plain(g)) || plain(g).includes(plain(x.name)))?.id)
    .filter((id): id is number => Boolean(id));
  const params: Record<string, string> = {
    watch_region: "ES",
    with_watch_providers: String(provider.provider_id),
    with_watch_monetization_types: "flatrate",
    sort_by: "popularity.desc",
    include_adult: "false",
    "vote_count.gte": "50",
  };
  if (genreIds.length) params.with_genres = genreIds.join(",");
  const d = await tmdb<{
    results: { title?: string; name?: string; release_date?: string; first_air_date?: string; genre_ids: number[]; overview: string }[];
  }>(`/discover/${media}`, params);
  return {
    plataforma: provider.provider_name,
    resultados: d.results.slice(0, 15).map((r) => ({
      titulo: (r.title ?? r.name)!,
      año: yearOf(r.release_date ?? r.first_air_date),
      tipo: media === "tv" ? "serie" : "película",
      generos: r.genre_ids.map((id) => allGenres.find((g) => g.id === id)?.name).filter((g): g is string => Boolean(g)),
      sinopsis: r.overview.slice(0, 160),
    })),
  };
}

/** En qué plataformas de España se puede ver un título ahora. */
export async function whereToWatch(titulo: string): Promise<
  { titulo: string; año: number | null; tipo: string; suscripcion: string[]; alquiler_o_compra: string[] } | { aviso: string }
> {
  if (!enabled()) return { aviso: "Catálogo de pelis no configurado." };
  const found = await tmdb<{ results: MultiResult[] }>("/search/multi", { query: titulo, include_adult: "false" });
  const r = found.results.find((x) => x.media_type === "movie" || x.media_type === "tv");
  if (!r) return { aviso: `No encuentro «${titulo}».` };
  const w = await tmdb<{
    results?: Record<string, { flatrate?: { provider_name: string }[]; rent?: { provider_name: string }[]; buy?: { provider_name: string }[] }>;
  }>(`/${r.media_type}/${r.id}/watch/providers`);
  const es = w.results?.ES;
  const names = (l?: { provider_name: string }[]) => [...new Set((l ?? []).map((p) => p.provider_name))];
  return {
    titulo: (r.title ?? r.name)!,
    año: yearOf(r.release_date ?? r.first_air_date),
    tipo: r.media_type === "tv" ? "serie" : "película",
    suscripcion: names(es?.flatrate),
    alquiler_o_compra: [...new Set([...names(es?.rent), ...names(es?.buy)])],
  };
}
