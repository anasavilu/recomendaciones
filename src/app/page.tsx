import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { KINDS, KIND_PLURAL, type Kind } from "@/lib/catalog/types";
import { ENTRY_SELECT, loadSuggestions, type EntryRow as Row } from "@/lib/entries";
import { EntryRow } from "@/components/entry-row";
import { HomeSearch } from "@/components/home-search";
import { NavLink } from "@/components/nav-link";
import { HomeHeader } from "@/components/assistant";
import { FeedbackForm } from "./comentarios/form";
import { FilterSheet, type FilterSection } from "@/components/filter-sheet";
import { ALL_FACETS, FACETS, facetOptions, facetValues } from "@/lib/facets";
import { personOf } from "@/lib/entry-format";
import { norm } from "@/lib/text";

type View = "pendientes" | "hechos" | "todo";
type Rec = "si" | "no" | null;
type Filters = {
  q: string;
  kind: Kind | null;
  view: View;
  rec: Rec;
  genero: string | null;
  de: string | null; // quién lo recomendó: "@ana" o un nombre
  etiqueta: string | null;
  fav: boolean;
  plataforma: string | null;
};

function parse(sp: Record<string, string | string[] | undefined>): Filters {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const kind = one(sp.tipo) as Kind;
  const view = one(sp.ver) as View;
  return {
    q: one(sp.q).trim(),
    kind: KINDS.includes(kind) ? kind : null,
    view: ["pendientes", "hechos", "todo"].includes(view) ? view : "pendientes",
    rec: one(sp.rec) === "si" ? "si" : one(sp.rec) === "no" ? "no" : null,
    genero: one(sp.genero).trim().slice(0, 80) || null,
    plataforma: one(sp.plataforma).trim().slice(0, 80) || null,
    de: one(sp.de).trim().slice(0, 80) || null,
    etiqueta: one(sp.etiqueta).trim().slice(0, 80) || null,
    fav: one(sp.fav) === "1",
  };
}

function href(f: Filters, change: Partial<Filters>) {
  const n = { ...f, ...change };
  // Género y plataforma dependen de la categoría: al cambiar de categoría se quitan
  if ("kind" in change && change.kind !== f.kind) {
    n.genero = change.genero ?? null;
    n.plataforma = change.plataforma ?? null;
  }
  const p = new URLSearchParams();
  if (change.q) p.set("q", change.q);
  if (n.kind) p.set("tipo", n.kind);
  if (n.view !== "pendientes") p.set("ver", n.view);
  // El filtro 👍/👎 no tiene sentido en "Pendientes"
  if (n.view !== "pendientes" && n.rec) p.set("rec", n.rec);
  if (n.kind && n.genero) p.set("genero", n.genero);
  if (n.kind && n.plataforma) p.set("plataforma", n.plataforma);
  if (n.de) p.set("de", n.de);
  if (n.etiqueta) p.set("etiqueta", n.etiqueta);
  if (n.fav) p.set("fav", "1");
  const s = p.toString();
  return s ? `/?${s}` : "/";
}

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-4 pb-28 sm:px-6">
      <HomeHeader />
      <Suspense fallback={<p className="py-10 text-ink-soft">Cargando tu lista…</p>}>
        <Content searchParams={searchParams} />
      </Suspense>
      <footer className="mt-auto border-t border-rule pt-6">
        <FeedbackForm page="/" compact />
      </footer>
      <Link
        href="/nuevo"
        className="fixed bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-stamp px-7 py-3.5 text-base font-semibold text-stamp-ink shadow-[0_6px_20px_-6px_var(--stamp)]"
      >
        Añadir recomendación
      </Link>
    </main>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const f = parse(await searchParams);
  const supabase = await createClient();

  let query = supabase
    .from("entries")
    .select(f.kind ? ENTRY_SELECT.replace("catalog_items(*)", "catalog_items!inner(*)") : ENTRY_SELECT)
    .order("created_at", { ascending: false })
    .limit(200);

  if (f.kind) query = query.eq("catalog_items.kind", f.kind);
  if (f.view === "pendientes") query = query.in("status", ["pendiente", "en_curso"]);
  if (f.view === "hechos") query = query.eq("status", "hecho");
  if (f.view !== "pendientes" && f.rec) query = query.eq("would_recommend", f.rec === "si");
  if (f.fav) query = query.eq("is_favorite", true);

  const [{ data, error }, { tags, people }] = await Promise.all([query, loadSuggestions(supabase)]);
  if (error) throw error;
  const all = (data ?? []) as unknown as Row[];

  // Filtros de la categoría elegida: opciones sacadas de lo que tienes guardado
  const facets = f.kind ? (FACETS[f.kind] ?? []) : ALL_FACETS;
  const facetUI = facets
    .map((fc) => {
      const opts = facetOptions(all, fc.key);
      const value = f[fc.key];
      if (value && !opts.some((o) => o.value === value)) opts.unshift({ value, count: 0 });
      return { ...fc, value, opts };
    })
    .filter((fc) => fc.opts.length > 0);
  const entries = all.filter(
    (e) =>
      (!f.genero || facetValues(e, "genero").includes(f.genero)) &&
      (!f.plataforma || facetValues(e, "plataforma").includes(f.plataforma)) &&
      (!f.de || e.entry_recommendations.some((r) => personOf(r.recommenders).token === f.de)) &&
      (!f.etiqueta || e.entry_tags.some((t) => norm(t.tags.name) === norm(f.etiqueta!))),
  );
  const filtering = Boolean(f.genero || f.plataforma || f.de || f.etiqueta);
  // "Ver en mapa" solo en las secciones con ubicación
  const hasMap = f.kind === "restaurante" || f.kind === "lugar" || f.kind === "evento";
  const deName = f.de ? (people.find((p) => p.token === f.de)?.name ?? f.de.replace(/^@/, "")) : null;

  const chips = (
      <nav aria-label="Tipo" className="flex flex-wrap gap-1.5">
        <Chip active={!f.kind} href={href(f, { kind: null })}>
          Todo
        </Chip>
        {KINDS.filter((k) => k !== "otro").map((k) => (
          <Chip key={k} active={f.kind === k} href={href(f, { kind: k })}>
            {KIND_PLURAL[k]}
          </Chip>
        ))}
      </nav>
  );

  // ---- Panel de filtros ----
  const clear = { fav: false, rec: null, genero: null, plataforma: null, de: null, etiqueta: null } as const;
  const count = <T,>(list: Row[], pick: (e: Row) => T[], v: T) => list.filter((e) => pick(e).includes(v)).length;
  const sections: FilterSection[] = [
    {
      title: "Favoritos",
      options: [{ key: "fav", label: <>★ Solo favoritos</>, href: href(f, { fav: !f.fav }), active: f.fav }],
    },
  ];
  if (f.view !== "pendientes")
    sections.push({
      title: "¿Lo recomendarías?",
      options: (
        [
          [null, "Todos"],
          ["si", "👍 Sí"],
          ["no", "👎 No"],
        ] as const
      ).map(([r, label]) => ({ key: String(r), label, href: href(f, { rec: r }), active: f.rec === r })),
    });
  for (const fc of facetUI)
    sections.push({
      title: fc.label,
      options: [
        { key: "*", label: "Todos", href: href(f, { [fc.key]: null }), active: !fc.value },
        ...fc.opts.map((o) => ({
          key: o.value,
          label: (
            <>
              {o.value} <span className="ml-1 opacity-60">{o.count}</span>
            </>
          ),
          href: href(f, { [fc.key]: o.value }),
          active: fc.value === o.value,
        })),
      ],
    });
  const peopleHere = people
    .map((p) => ({ p, n: count(all, (e) => e.entry_recommendations.map((r) => personOf(r.recommenders).token), p.token) }))
    .filter((x) => x.n > 0 || x.p.token === f.de)
    .sort((a, b) => b.n - a.n);
  if (peopleHere.length)
    sections.push({
      title: "Recomendado por",
      options: [
        { key: "*", label: "Cualquiera", href: href(f, { de: null }), active: !f.de },
        ...peopleHere.map(({ p, n }) => ({
          key: p.token,
          label: (
            <>
              <span className="hand text-lg leading-none">{p.name}</span>
              {p.username && <span className="ml-1 text-xs opacity-60">@{p.username}</span>}
              <span className="ml-1.5 opacity-60">{n}</span>
            </>
          ),
          href: href(f, { de: p.token }),
          active: f.de === p.token,
        })),
      ],
    });
  const tagsHere = tags
    .map((t) => ({ t, n: count(all, (e) => e.entry_tags.map((x) => norm(x.tags.name)), norm(t.name)) }))
    .filter((x) => x.n > 0 || (f.etiqueta && norm(x.t.name) === norm(f.etiqueta)))
    .sort((a, b) => b.n - a.n);
  if (tagsHere.length)
    sections.push({
      title: "Etiquetas",
      options: [
        { key: "*", label: "Todas", href: href(f, { etiqueta: null }), active: !f.etiqueta },
        ...tagsHere.map(({ t, n }) => ({
          key: t.name,
          label: (
            <>
              {t.name} <span className="ml-1 opacity-60">{n}</span>
            </>
          ),
          href: href(f, { etiqueta: t.name }),
          active: Boolean(f.etiqueta && norm(f.etiqueta) === norm(t.name)),
        })),
      ],
    });

  // Lo que está aplicado, para verlo y quitarlo con una ×
  const applied: { key: string; label: React.ReactNode; href: string }[] = [
    ...(f.fav ? [{ key: "fav", label: <>★ Favoritos</>, href: href(f, { fav: false }) }] : []),
    ...(f.view !== "pendientes" && f.rec ? [{ key: "rec", label: f.rec === "si" ? "👍 Lo recomendaría" : "👎 No lo recomendaría", href: href(f, { rec: null }) }] : []),
    ...(f.genero ? [{ key: "genero", label: f.genero, href: href(f, { genero: null }) }] : []),
    ...(f.plataforma ? [{ key: "plataforma", label: f.plataforma, href: href(f, { plataforma: null }) }] : []),
    ...(f.de
      ? [{ key: "de", label: <>De <span className="hand text-base leading-none">{deName}</span></>, href: href(f, { de: null }) }]
      : []),
    ...(f.etiqueta ? [{ key: "etiqueta", label: f.etiqueta, href: href(f, { etiqueta: null }) }] : []),
  ];

  return (
    <HomeSearch initialQ={f.q} kind={f.kind} filters={chips}>
      <nav aria-label="Estado" className="mt-4 flex items-end gap-5 border-b border-rule text-sm">
        {(
          [
            ["pendientes", "Pendientes"],
            ["hechos", "Realizados"],
            ["todo", "Todo"],
          ] as const
        ).map(([v, label]) => (
          <NavLink
            key={v}
            href={href(f, { view: v })}
            aria-current={f.view === v ? "page" : undefined}
            className={`-mb-px border-b-2 pb-2 ${f.view === v ? "border-stamp font-semibold" : "border-transparent text-ink-soft"}`}
          >
            {label}
          </NavLink>
        ))}
        <FilterSheet sections={sections} activeCount={applied.length} clearHref={href(f, clear)} resultCount={entries.length} />
      </nav>

      {(applied.length > 0 || hasMap) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {applied.map((a) => (
            <NavLink
              key={a.key}
              href={a.href}
              aria-label="Quitar este filtro"
              className="inline-flex items-center gap-1.5 rounded-full border border-ink bg-ink px-3 py-1 text-[0.8125rem] text-paper"
            >
              {a.label} <span aria-hidden>×</span>
            </NavLink>
          ))}
          {hasMap && (
            <Link
              href={`/mapa?tipo=${f.kind}${f.view === "pendientes" ? "" : "&ver=todo"}`}
              className="ml-auto text-sm text-stamp underline underline-offset-4"
            >
              Ver en mapa
            </Link>
          )}
        </div>
      )}

      {entries.length > 0 ? (
        <ul className="divide-y divide-rule">
          {entries.map((e) => (
            <EntryRow key={e.id} entry={e} />
          ))}
        </ul>
      ) : (
        <Empty filters={f} filtering={filtering || Boolean(f.view !== "pendientes" && f.rec)} />
      )}
    </HomeSearch>
  );
}

function Chip({ active, href, children }: { active: boolean; href: string; children: React.ReactNode }) {
  return (
    <NavLink
      href={href}
      aria-current={active ? "page" : undefined}
      className={`shrink-0 rounded-full border px-3 py-1 text-[0.8125rem] leading-5 ${
        active ? "border-ink bg-ink text-paper" : "border-rule bg-sheet text-ink"
      }`}
    >
      {children}
    </NavLink>
  );
}

function Empty({ filters, filtering }: { filters: Filters; filtering: boolean }) {
  if (filtering)
    return (
      <p className="py-12 text-ink-soft">
        Nada con esos filtros en esta pestaña.{" "}
        <Link href={href(filters, { genero: null, plataforma: null, de: null, etiqueta: null, fav: false, rec: null })} className="text-ink underline underline-offset-4">
          Quitar filtros
        </Link>
      </p>
    );
  if (filters.fav)
    return (
      <p className="py-12 text-ink-soft">
        Aún no tienes favoritos aquí. Pulsa la ☆ de cualquier recomendación para marcarla.
      </p>
    );
  if (filters.view === "hechos" && filters.rec)
    return (
      <p className="py-12 text-ink-soft">
        {filters.rec === "si"
          ? "Aún no has marcado nada con 👍. Cuando algo te guste, márcalo para tenerlo a mano al recomendar."
          : "Nada marcado con 👎."}
      </p>
    );
  if (filters.view === "hechos")
    return <p className="py-12 text-ink-soft">Cuando marques algo como visto, leído o ido, aparecerá aquí.</p>;
  return (
    <div className="flex flex-col gap-3 py-12">
      <p className="text-lg">Aquí irá lo que te recomienden.</p>
      <p className="text-ink-soft">
        Escribe arriba el título de algo que te hayan recomendado para añadirlo, con quién te lo dijo. Luego
        podrás buscar por tema, por tipo o por persona.
      </p>
    </div>
  );
}
