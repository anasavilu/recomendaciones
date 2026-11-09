import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { KINDS, KIND_PLURAL, type Kind } from "@/lib/catalog/types";
import { ENTRY_SELECT, loadSuggestions, type EntryRow as Row } from "@/lib/entries";
import { EntryRow } from "@/components/entry-row";

type View = "pendientes" | "hechos" | "todo";
type Filters = { q: string; kind: Kind | null; view: View };

function parse(sp: Record<string, string | string[] | undefined>): Filters {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const kind = one(sp.tipo) as Kind;
  const view = one(sp.ver) as View;
  return {
    q: one(sp.q).trim(),
    kind: KINDS.includes(kind) ? kind : null,
    view: ["pendientes", "hechos", "todo"].includes(view) ? view : "pendientes",
  };
}

function href(f: Filters, change: Partial<Filters>) {
  const n = { ...f, ...change };
  const p = new URLSearchParams();
  if (n.q) p.set("q", n.q);
  if (n.kind) p.set("tipo", n.kind);
  if (n.view !== "pendientes") p.set("ver", n.view);
  const s = p.toString();
  return s ? `/?${s}` : "/";
}

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <main className="mx-auto max-w-2xl px-4 pb-32 sm:px-6">
      <header className="flex items-center justify-between pt-6 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Recomendados</h1>
        <Link href="/cuenta" className="text-sm text-ink-soft underline-offset-4 hover:underline">
          Mi cuenta
        </Link>
      </header>
      <Suspense fallback={<p className="py-10 text-ink-soft">Cargando tu lista…</p>}>
        <Content searchParams={searchParams} />
      </Suspense>
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

  if (f.q) {
    const { data: hits, error } = await supabase.rpc("search_entries", { q: f.q, kind_filter: f.kind });
    if (error) throw error;
    query = query.in("id", (hits ?? []).map((h: { id: string }) => h.id));
  }

  const [{ data, error }, { tags, people }] = await Promise.all([query, loadSuggestions(supabase)]);
  if (error) throw error;
  const entries = (data ?? []) as unknown as Row[];

  return (
    <>
      <form role="search" action="/" className="sticky top-0 z-10 -mx-4 bg-paper/95 px-4 pb-3 pt-1 backdrop-blur sm:-mx-6 sm:px-6">
        {f.kind && <input type="hidden" name="tipo" value={f.kind} />}
        {f.view !== "pendientes" && <input type="hidden" name="ver" value={f.view} />}
        <label className="sr-only" htmlFor="q">
          Buscar en tu lista
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={f.q}
          placeholder="Comedia romántica, Maribel, Murakami…"
          className="w-full rounded-full border border-rule bg-sheet px-5 py-3 text-base placeholder:text-ink-soft/70"
        />
      </form>

      <nav aria-label="Tipo" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6">
        <Chip active={!f.kind} href={href(f, { kind: null })}>
          Todo
        </Chip>
        {KINDS.filter((k) => k !== "otro").map((k) => (
          <Chip key={k} active={f.kind === k} href={href(f, { kind: k })}>
            {KIND_PLURAL[k]}
          </Chip>
        ))}
      </nav>

      <nav aria-label="Estado" className="mt-4 flex gap-5 border-b border-rule text-sm">
        {(
          [
            ["pendientes", "Pendientes"],
            ["hechos", "Ya hechos"],
            ["todo", "Todo"],
          ] as const
        ).map(([v, label]) => (
          <Link
            key={v}
            href={href(f, { view: v })}
            aria-current={f.view === v ? "page" : undefined}
            className={`-mb-px border-b-2 pb-2 ${f.view === v ? "border-stamp font-semibold" : "border-transparent text-ink-soft"}`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {entries.length > 0 ? (
        <ul className="divide-y divide-rule">
          {entries.map((e) => (
            <EntryRow key={e.id} entry={e} />
          ))}
        </ul>
      ) : (
        <Empty filters={f} />
      )}

      {!f.q && (tags.length > 0 || people.length > 0) && (
        <section className="mt-10 flex flex-col gap-6 text-sm">
          {tags.length > 0 && (
            <div className="flex flex-col gap-2">
              <h2 className="text-ink-soft">Tus etiquetas</h2>
              <ul className="flex flex-wrap gap-2">
                {tags.map((t) => (
                  <li key={t.name}>
                    <Link href={href(f, { q: t.name })} className="rounded bg-mustard-soft px-2 py-1">
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
                    <Link href={href(f, { q: p.token })} className="hand text-xl">
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
    </>
  );
}

function Chip({ active, href, children }: { active: boolean; href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm ${
        active ? "border-ink bg-ink text-paper" : "border-rule bg-sheet text-ink"
      }`}
    >
      {children}
    </Link>
  );
}

function Empty({ filters }: { filters: Filters }) {
  if (filters.q)
    return (
      <p className="py-12 text-ink-soft">
        Nada en tu lista coincide con «{filters.q}». Prueba con otra palabra, o mira en{" "}
        <Link className="underline" href={href(filters, { view: "todo" })}>
          todo
        </Link>
        .
      </p>
    );
  if (filters.view === "hechos")
    return <p className="py-12 text-ink-soft">Cuando marques algo como visto, leído o ido, aparecerá aquí.</p>;
  return (
    <div className="flex flex-col gap-3 py-12">
      <p className="text-lg">Aquí irá lo que te recomienden.</p>
      <p className="text-ink-soft">
        La próxima vez que alguien te diga «tienes que ver…», apúntalo con su nombre. Luego podrás buscar por
        tema, por tipo o por persona.
      </p>
    </div>
  );
}
