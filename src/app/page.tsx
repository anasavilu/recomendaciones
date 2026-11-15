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
import { FacetSelect } from "@/components/facet-select";
import { FACETS, facetOptions, facetValues } from "@/lib/facets";
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
  // El filtro 👍/👎 solo tiene sentido en "Realizados"
  if (n.view === "hechos" && n.rec) p.set("rec", n.rec);
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
  if (f.view === "hechos" && f.rec) query = query.eq("would_recommend", f.rec === "si");
  if (f.fav) query = query.eq("is_favorite", true);

  const [{ data, error }, { tags, people }] = await Promise.all([query, loadSuggestions(supabase)]);
  if (error) throw error;
  const all = (data ?? []) as unknown as Row[];

  // Filtros de la categoría elegida: opciones sacadas de lo que tienes guardado
  const facets = (f.kind && FACETS[f.kind]) || [];
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
              <NavLink
          href={f.kind && ["restaurante", "lugar", "evento"].includes(f.kind) ? `/mapa?tipo=${f.kind}` : "/mapa"}
          className="shrink-0 rounded-full border border-stamp px-3 py-1 text-[0.8125rem] leading-5 text-stamp"
        >
          Mapa
        </NavLink>
      </nav>
  );

  return (
    <HomeSearch initialQ={f.q} kind={f.kind} filters={chips}>
      <nav aria-label="Estado" className="mt-4 flex gap-5 border-b border-rule text-sm">
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
        <NavLink
          href={href(f, { fav: !f.fav })}
          aria-current={f.fav ? "page" : undefined}
          className={`-mb-px ml-auto border-b-2 pb-2 ${f.fav ? "border-mustard font-semibold" : "border-transparent text-ink-soft"}`}
        >
          <span className={f.fav ? "text-mustard" : undefined}>★</span> Favoritos
        </NavLink>
      </nav>

      {f.view === "hechos" && (
        <nav aria-label="Lo recomendarías" className="mt-3 flex flex-wrap gap-2">
          {(
            [
              [null, "Todos"],
              ["si", "👍 Lo recomendaría"],
              ["no", "👎 No lo recomendaría"],
            ] as const
          ).map(([r, label]) => (
            <Chip key={label} active={f.rec === r} href={href(f, { rec: r })}>
              {label}
            </Chip>
          ))}
        </nav>
      )}

      {(f.de || f.etiqueta) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {f.de && (
            <NavLink
              href={href(f, { de: null })}
              aria-label={`Quitar filtro: recomendado por ${deName}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-ink bg-ink px-3 py-1 text-[0.8125rem] text-paper"
            >
              Recomendado por <span className="hand text-base leading-none">{deName}</span> <span aria-hidden>×</span>
            </NavLink>
          )}
          {f.etiqueta && (
            <NavLink
              href={href(f, { etiqueta: null })}
              aria-label={`Quitar filtro: etiqueta ${f.etiqueta}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-ink bg-ink px-3 py-1 text-[0.8125rem] text-paper"
            >
              Etiqueta: {f.etiqueta} <span aria-hidden>×</span>
            </NavLink>
          )}
        </div>
      )}

      {facetUI.length > 0 && (
        <div aria-label="Filtros" role="group" className="mt-3 flex flex-wrap items-center gap-2">
          {facetUI.map((fc) => (
            <FacetSelect
              key={fc.key}
              label={fc.label}
              value={fc.value}
              allLabel={fc.all}
              allHref={href(f, { [fc.key]: null })}
              options={fc.opts.map((o) => ({ ...o, href: href(f, { [fc.key]: o.value }) }))}
            />
          ))}
          {filtering && (
            <Link href={href(f, { genero: null, plataforma: null, de: null, etiqueta: null })} className="text-sm text-ink-soft underline underline-offset-4">
              Quitar filtros
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
        <Empty filters={f} filtering={filtering} />
      )}

      {(tags.length > 0 || people.length > 0) && (
        <section className="mt-10 flex flex-col gap-6 text-sm">
          {tags.length > 0 && (
            <div className="flex flex-col gap-2">
              <h2 className="text-ink-soft">Tus etiquetas</h2>
              <ul className="flex flex-wrap gap-2">
                {tags.map((t) => (
                  <li key={t.name}>
                    <Link href={href(f, { etiqueta: t.name })} scroll={false} className="rounded bg-mustard-soft px-2 py-1">
                      {t.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {people.length > 0 && (
            <div className="flex flex-col gap-2">
              <h2 className="text-ink-soft">Quién te recomienda</h2>
              <ul className="flex flex-wrap gap-x-4 gap-y-1">
                {people.map((p) => (
                  <li key={p.token}>
                    <Link href={href(f, { de: p.token })} scroll={false} className="hand text-xl">
                      {p.name}
                      {p.username && <span className="font-sans text-xs text-ink-soft"> @{p.username}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
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
        <Link href={href(filters, { genero: null, plataforma: null, de: null, etiqueta: null })} className="text-ink underline underline-offset-4">
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
