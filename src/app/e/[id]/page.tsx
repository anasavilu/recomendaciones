import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { KIND_LABEL } from "@/lib/catalog/types";
import { ENTRY_SELECT, loadSuggestions, personOf, type EntryRow } from "@/lib/entries";
import { Cover } from "@/components/cover";
import { RecommendedBy } from "@/components/recommended-by";
import { EditEntry } from "./edit-entry";

const LINK_LABEL: Record<string, string> = {
  filmaffinity: "Ver en FilmAffinity",
  donde_ver: "Dónde verla",
  tmdb: "Ficha en TMDB",
  google_books: "Ficha en Google Books",
  openlibrary: "Ficha en Open Library",
  maps: "Abrir en Google Maps",
  web: "Web",
};

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
  const c = e.catalog_items;
  const who = e.entry_recommendations.map((r) => personOf(r.recommenders));
  const comments = e.entry_recommendations.filter((r) => r.comment);
  const streaming = (c.extra?.streaming_es as string[] | undefined) ?? [];
  const cast = (c.extra?.cast as string[] | undefined) ?? [];
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
          <h1 className="text-3xl font-semibold leading-tight tracking-tight text-balance">{c.title}</h1>
          {c.original_title && c.original_title !== c.title && (
            <p className="text-sm text-ink-soft italic">{c.original_title}</p>
          )}
          <p className="text-sm text-ink-soft">{facts}</p>
          {c.creators?.length > 0 && <p className="text-sm">{c.creators.join(", ")}</p>}
          {c.address && <p className="text-sm">{c.address}</p>}
          <RecommendedBy people={who} className="mt-2 text-2xl" />
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

      {(cast.length > 0 || streaming.length > 0) && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          {cast.length > 0 && (
            <>
              <dt className="text-ink-soft">Reparto</dt>
              <dd>{cast.join(", ")}</dd>
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

      {c.source === "tmdb" && (
        <p className="text-xs text-ink-soft">
          Datos de TMDB. Este producto usa la API de TMDB pero no está respaldado ni certificado por TMDB.
        </p>
      )}

      <EditEntry
        entryId={e.id}
        kind={c.kind}
        status={e.status}
        notes={e.notes ?? ""}
        tags={e.entry_tags.map((t) => ({ token: t.tags.name, name: t.tags.name }))}
        people={who}
        tagSuggestions={suggestions.tags}
        peopleSuggestions={suggestions.people}
      />
    </article>
  );
}
