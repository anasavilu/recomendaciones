import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { AddForm, type AddInitial } from "./add-form";
import { KINDS, type Kind } from "@/lib/catalog/types";
import { loadSuggestions } from "@/lib/entries";

const SOURCES = ["tmdb", "google_books", "openlibrary", "google_places", "osm", "esmadrid", "madrid_agenda", "bcn_agenda"] as const;

/** Lo que llega desde el buscador de la pantalla principal. */
function initialFrom(sp: Record<string, string | string[] | undefined>): AddInitial {
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
  };
  const kind = KINDS.includes(one("tipo") as Kind) ? (one("tipo") as Kind) : undefined;
  const source = one("source") as (typeof SOURCES)[number];
  if (SOURCES.includes(source) && one("source_id") && one("title") && kind) {
    const year = Number(one("year"));
    const img = one("img");
    return {
      picked: {
        source,
        source_id: one("source_id"),
        kind,
        title: one("title").slice(0, 300),
        year: Number.isInteger(year) && year > 0 ? year : null,
        subtitle: one("sub").slice(0, 200) || null,
        image_url: img.startsWith("https://") ? img : null,
      },
    };
  }
  const q = one("q").slice(0, 200);
  return { kind, q, manual: Boolean(q) };
}

export default function NewPage({ searchParams }: PageProps<"/nuevo">) {
  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 sm:px-6">
      <header className="flex items-center justify-between pt-6 pb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Nueva recomendación</h1>
        <Link href="/" className="text-sm text-ink-soft">
          Cancelar
        </Link>
      </header>
      <Suspense>
        <WithSuggestions searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function WithSuggestions({ searchParams }: { searchParams: PageProps<"/nuevo">["searchParams"] }) {
  const supabase = await createClient();
  const [s, sp] = await Promise.all([loadSuggestions(supabase), searchParams]);
  const initial = initialFrom(sp);
  // La clave hace que el formulario empiece de cero con cada resultado elegido. Sin ella,
  // Next conserva el estado de la visita anterior a /nuevo y se quedaba la recomendación previa.
  return <AddForm key={JSON.stringify(initial)} tagSuggestions={s.tags} peopleSuggestions={s.people} initial={initial} />;
}
