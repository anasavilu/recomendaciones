import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { KIND_LABEL } from "@/lib/catalog/types";
import { ENTRY_SELECT, eventTiming, googleRating, loadSuggestions, personOf, type EntryRow } from "@/lib/entries";
import { dateRange } from "@/lib/catalog/events/shared";
import { createAdminClient } from "@/lib/supabase/server";
import { placeDetails, placesEnabled } from "@/lib/catalog/places";
import { Cover } from "@/components/cover";
import { RecommendedBy } from "@/components/recommended-by";
import { EditEntry } from "./edit-entry";
import { FavoriteStar } from "@/components/favorite-star";

const LINK_LABEL: Record<string, string> = {
  filmaffinity: "Ver en FilmAffinity",
  donde_ver: "Dónde verla",
  tmdb: "Ficha en TMDB",
  google_books: "Ficha en Google Books",
  openlibrary: "Ficha en Open Library",
  maps: "Abrir en Google Maps",
  osm: "Ver en OpenStreetMap",
  web: "Web",
};

const DAYS: Record<string, string> = { Mo: "Lu", Tu: "Ma", We: "Mi", Th: "Ju", Fr: "Vi", Sa: "Sá", Su: "Do", PH: "Festivos" };

/** "Mo-Fr 13:00-16:00; Su off" → "Lu-Vi 13:00-16:00 · Do cerrado" */
function horario(raw: string) {
  return raw
    .split(";")
    .map((part) =>
      part
        .trim()
        .replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su|PH)\b/g, (d) => DAYS[d])
        .replace(/\boff\b|\bclosed\b/g, "cerrado"),
    )
    .filter(Boolean)
    .join(" · ");
}

export default function EntryPage({ params, searchParams }: PageProps<"/e/[id]">) {
  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 sm:px-6">
      <header className="pt-6 pb-4">
        <Link href="/" className="text-sm text-ink-soft">
          ← Mi lista
        </Link>
      </header>
      <Suspense fallback={<p className="py-10 text-ink-soft">Cargando…</p>}>
        <Entry params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Entry({
  params,
  searchParams,
}: {
  params: PageProps<"/e/[id]">["params"];
  searchParams: PageProps<"/e/[id]">["searchParams"];
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const [{ data }, suggestions] = await Promise.all([
    supabase.from("entries").select(ENTRY_SELECT).eq("id", id).maybeSingle(),
    loadSuggestions(supabase),
  ]);
  if (!data) notFound();
  const e = data as unknown as EntryRow;
  // Sitios de Google guardados antes de traer la nota: se actualizan una vez al abrir la ficha
  const ci = e.catalog_items;
  if (ci.source === "google_places" && ci.source_id && !("rated_at" in (ci.extra ?? {})) && placesEnabled()) {
    try {
      const fresh = await placeDetails(ci.source_id);
      const { data: updated } = await createAdminClient()
        .from("catalog_items")
        .update({ extra: fresh.extra, genres: fresh.genres, links: fresh.links, address: fresh.address })
        .eq("id", e.catalog_items.id)
        .select("*")
        .single();
      if (updated) e.catalog_items = updated as EntryRow["catalog_items"];
    } catch (err) {
      console.warn("[lugares] No se pudo actualizar la ficha:", (err as Error).message);
    }
  }
  const c = e.catalog_items;
  const rating = googleRating(c.extra);
  const timing = c.kind === "evento" ? eventTiming(c.extra) : null;
  const eventWhen = timing ? dateRange(timing.start, timing.end) : null;
  const eventTime = c.kind === "evento" ? ((c.extra?.time as string | null) ?? null) : null;
  const eventPrice = c.kind === "evento" ? ((c.extra?.price as string | null) ?? null) : null;
  const who = e.entry_recommendations.map((r) => personOf(r.recommenders));
  const comments = e.entry_recommendations.filter((r) => r.comment);
  const streaming = (c.extra?.streaming_es as string[] | undefined) ?? [];
  const cast = (c.extra?.cast as string[] | undefined) ?? [];
  const hours = (c.extra?.opening_hours as string | null | undefined) ?? null;
  const hoursLines = (c.extra?.hours_lines as string[] | null | undefined) ?? null;
  const phone = (c.extra?.phone as string | null | undefined) ?? null;
  const facts = [KIND_LABEL[c.kind], c.year, c.genres?.slice(0, 3).join(", ")].filter(Boolean).join(" · ");

  return (
    <article className="flex flex-col gap-8">
      {sp.ya && (
        <p role="status" className="rounded-lg bg-mustard-soft px-4 py-3 text-sm">
          Ya lo tenías en tu lista: hemos sumado la nueva recomendación.
        </p>
      )}

      <div className="flex gap-5">
        <Cover src={c.image_url} kind={c.kind} title={c.title} size="lg" />
        <div className="flex min-w-0 flex-col gap-2 pt-1">
          <div className="flex items-start gap-1">
            <h1 className="flex-1 text-3xl font-semibold leading-tight tracking-tight text-balance">{c.title}</h1>
            <FavoriteStar entryId={e.id} initial={e.is_favorite} title={c.title} size="lg" />
          </div>
          {c.original_title && c.original_title !== c.title && (
            <p className="text-sm text-ink-soft italic">{c.original_title}</p>
          )}
          <p className="text-sm text-ink-soft">{facts}</p>
          {rating && <p className="text-sm">{rating}</p>}
          {eventWhen && <p className="text-sm">{eventWhen}</p>}
          {timing?.state === "soon" && (
            <p className="text-sm font-semibold text-stamp">{timing.days === 0 ? "Acaba hoy" : `Acaba en ${timing.days} días`}</p>
          )}
          {timing?.state === "ended" && <p className="text-sm text-ink-soft">Ya terminó</p>}
          {c.creators?.length > 0 && <p className="text-sm">{c.creators.join(", ")}</p>}
          {c.address && <p className="text-sm">{c.address}</p>}
          <RecommendedBy people={who} className="mt-2 text-2xl" />
          {e.status === "hecho" && e.would_recommend !== null && (
            <p className="text-sm">{e.would_recommend ? "👍 Lo recomendarías" : "👎 No lo recomendarías"}</p>
          )}
        </div>
      </div>

      {comments.length > 0 && (
        <ul className="flex flex-col gap-2">
          {comments.map((r) => (
            <li key={r.recommenders.id} className="border-l-2 border-stamp pl-3">
              <p>«{r.comment}»</p>
              <p className="hand text-lg">{r.recommenders.name}</p>
            </li>
          ))}
        </ul>
      )}

      {c.summary && <p className="max-w-prose leading-relaxed">{c.summary}</p>}

      {(cast.length > 0 || streaming.length > 0 || hours || hoursLines?.length || phone || eventTime || eventPrice) && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          {cast.length > 0 && (
            <>
              <dt className="text-ink-soft">Reparto</dt>
              <dd>{cast.join(", ")}</dd>
            </>
          )}
          {eventTime && (
            <>
              <dt className="text-ink-soft">Horario</dt>
              <dd>{eventTime}</dd>
            </>
          )}
          {eventPrice && (
            <>
              <dt className="text-ink-soft">Precio</dt>
              <dd>{eventPrice}</dd>
            </>
          )}
          {hoursLines && hoursLines.length > 0 && (
            <>
              <dt className="text-ink-soft">Horario</dt>
              <dd>
                <ul>
                  {hoursLines.map((l) => (
                    <li key={l} className="first-letter:uppercase">
                      {l}
                    </li>
                  ))}
                </ul>
              </dd>
            </>
          )}
          {!hoursLines?.length && hours && (
            <>
              <dt className="text-ink-soft">Horario</dt>
              <dd className="break-words">{horario(hours)}</dd>
            </>
          )}
          {phone && (
            <>
              <dt className="text-ink-soft">Teléfono</dt>
              <dd>
                <a href={`tel:${phone.replace(/\s/g, "")}`} className="underline underline-offset-4">
                  {phone}
                </a>
              </dd>
            </>
          )}
          {streaming.length > 0 && (
            <>
              <dt className="text-ink-soft">En España, en</dt>
              <dd>{streaming.join(", ")}</dd>
            </>
          )}
        </dl>
      )}

      {Object.keys(c.links ?? {}).length > 0 && (
        <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {Object.entries(c.links).map(([k, url]) => (
            <li key={k}>
              <a href={url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                {LINK_LABEL[k] ?? k}
              </a>
            </li>
          ))}
        </ul>
      )}

      {c.source === "google_places" && (
        <p className="text-xs text-ink-soft" translate="no">
          Datos de Google Maps
        </p>
      )}

      {(c.source === "esmadrid" || c.source === "madrid_agenda") && (
        <p className="text-xs text-ink-soft">Datos abiertos del Ayuntamiento de Madrid.</p>
      )}
      {c.source === "bcn_agenda" && <p className="text-xs text-ink-soft">Datos abiertos del Ayuntamiento de Barcelona (CC BY 4.0).</p>}

      {c.source === "osm" && (
        <p className="text-xs text-ink-soft">
          Datos ©{" "}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline">
            colaboradores de OpenStreetMap
          </a>
          .
        </p>
      )}

      {c.source === "tmdb" && (
        <p className="text-xs text-ink-soft">
          Datos de TMDB. Este producto usa la API de TMDB pero no está respaldado ni certificado por TMDB.
        </p>
      )}

      <EditEntry
        entryId={e.id}
        kind={c.kind}
        status={e.status}
        wouldRecommend={e.would_recommend}
        notes={e.notes ?? ""}
        tags={e.entry_tags.map((t) => ({ token: t.tags.name, name: t.tags.name }))}
        people={who}
        tagSuggestions={suggestions.tags}
        peopleSuggestions={suggestions.people}
      />
    </article>
  );
}
