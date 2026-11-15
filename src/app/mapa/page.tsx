import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { KIND_LABEL, KIND_PLURAL } from "@/lib/catalog/types";
import { ENTRY_SELECT, personOf, type EntryRow } from "@/lib/entries";
import { MapView, type MapPoint } from "@/components/map-view";
import { NavLink } from "@/components/nav-link";

const MAP_KINDS = ["restaurante", "lugar", "evento"] as const;
type MapKind = (typeof MAP_KINDS)[number];

export default function MapPage({ searchParams }: PageProps<"/mapa">) {
  return (
    <main className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
      <header className="pt-6 pb-4">
        <Link href="/" className="text-sm text-ink-soft">
          ← Mi lista
        </Link>
      </header>
      <h1 className="mb-4 text-3xl font-semibold tracking-tight">Mapa</h1>
      <Suspense fallback={<p className="text-ink-soft">Cargando el mapa…</p>}>
        <Points searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Points({ searchParams }: { searchParams: PageProps<"/mapa">["searchParams"] }) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const kind = MAP_KINDS.includes(one(sp.tipo) as MapKind) ? (one(sp.tipo) as MapKind) : null;
  const all = one(sp.ver) === "todo";

  const supabase = await createClient();
  let query = supabase
    .from("entries")
    .select(ENTRY_SELECT.replace("catalog_items(*)", "catalog_items!inner(*)"))
    .in("catalog_items.kind", kind ? [kind] : [...MAP_KINDS])
    .neq("status", "descartado")
    .limit(500);
  if (!all) query = query.in("status", ["pendiente", "en_curso"]);
  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as unknown as EntryRow[];
  const points: MapPoint[] = [];
  let missing = 0;
  for (const e of rows) {
    const c = e.catalog_items;
    const lat = Number(c.extra?.lat);
    const lon = Number(c.extra?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
      missing++;
      continue;
    }
    points.push({
      id: e.id,
      lat,
      lon,
      kind: c.kind as MapKind,
      done: e.status === "hecho",
      // Condiciones de Google (clientes del EEE): sobre un mapa solo coordenadas e id, no el nombre ni otros datos
      label: c.source === "google_places" ? null : c.title,
      kindLabel: KIND_LABEL[c.kind],
      who: e.entry_recommendations.map((r) => personOf(r.recommenders).name),
      tags: e.entry_tags.map((t) => t.tags.name),
      mapsUrl: c.links?.maps ?? null,
    });
  }

  const href = (k: MapKind | null, v: boolean) => {
    const p = new URLSearchParams();
    if (k) p.set("tipo", k);
    if (v) p.set("ver", "todo");
    const s = p.toString();
    return s ? `/mapa?${s}` : "/mapa";
  };
  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-[0.8125rem] leading-5 ${active ? "border-ink bg-ink text-paper" : "border-rule bg-sheet text-ink"}`;

  return (
    <div className="flex flex-col gap-3">
      <nav aria-label="Tipo" className="flex flex-wrap gap-1.5">
        <NavLink href={href(null, all)} className={chip(!kind)} aria-current={!kind ? "page" : undefined}>
          Todo
        </NavLink>
        {MAP_KINDS.map((k) => (
          <NavLink key={k} href={href(k, all)} className={chip(kind === k)} aria-current={kind === k ? "page" : undefined}>
            {KIND_PLURAL[k]}
          </NavLink>
        ))}
      </nav>
      <nav aria-label="Estado" className="flex gap-4 text-sm">
        <NavLink href={href(kind, false)} className={!all ? "font-semibold" : "text-ink-soft"} aria-current={!all ? "page" : undefined}>
          Pendientes
        </NavLink>
        <NavLink href={href(kind, true)} className={all ? "font-semibold" : "text-ink-soft"} aria-current={all ? "page" : undefined}>
          Pendientes y realizados
        </NavLink>
      </nav>

      <MapView points={points} />

      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
        <span><span style={{ color: "#b8336a" }}>●</span> Restaurantes</span>
        <span><span style={{ color: "#1b2440" }}>●</span> Otros lugares</span>
        <span><span style={{ color: "#c9971c" }}>●</span> Teatro y expos</span>
        <span>Relleno: pendiente · Hueco: realizado</span>
      </p>
      {points.length === 0 && (
        <p className="text-sm text-ink-soft">
          No hay nada con ubicación todavía. Los restaurantes, lugares y planes que guardes desde el buscador aparecerán aquí.
        </p>
      )}
      {missing > 0 && (
        <p className="text-sm text-ink-soft">
          {missing === 1 ? "1 recomendación no tiene" : `${missing} recomendaciones no tienen`} ubicación (por ejemplo, las añadidas a mano), así que no salen en el mapa.
        </p>
      )}
    </div>
  );
}
