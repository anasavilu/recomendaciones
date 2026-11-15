import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { KIND_LABEL } from "@/lib/catalog/types";
import { doneLabel, ratingOf } from "@/lib/entry-format";
import { followState, profileByUsername, type ProfileEntry } from "@/lib/people";
import { Cover } from "@/components/cover";
import { FollowButton } from "@/components/follow-button";

export default function UserPage({ params }: PageProps<"/u/[username]">) {
  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 sm:px-6">
      <header className="pt-6 pb-4">
        <Link href="/" className="text-sm text-ink-soft">
          ← Mi lista
        </Link>
      </header>
      <Suspense fallback={<p className="text-ink-soft">Cargando…</p>}>
        <Profile params={params} />
      </Suspense>
    </main>
  );
}

async function Profile({ params }: { params: PageProps<"/u/[username]">["params"] }) {
  const { username } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user!.id;
  const p = await profileByUsername(supabase, decodeURIComponent(username).replace(/^@/, ""));
  if (!p) notFound();
  const isMe = p.id === me;

  const [state, { data: canView }, { data: counts }, { data: rows }, { data: mine }] = await Promise.all([
    isMe ? Promise.resolve("nada" as const) : followState(supabase, me, p.id),
    supabase.rpc("can_view_profile", { owner: p.id }),
    supabase.rpc("follow_counts", { owner: p.id }).single<{ followers: number; following: number }>(),
    supabase.rpc("profile_entries", { owner: p.id }),
    supabase.from("entries").select("id,catalog_item_id").eq("owner_id", me),
  ]);
  const entries = (rows ?? []) as ProfileEntry[];
  const myItems = new Map((mine ?? []).map((m) => [m.catalog_item_id as string, m.id as string]));

  const liked = entries.filter((e) => e.status === "hecho" && e.would_recommend === true);
  const done = entries.filter((e) => e.status === "hecho" && e.would_recommend !== true);
  const pending = entries.filter((e) => e.status === "pendiente" || e.status === "en_curso");

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="hand text-4xl leading-tight">{p.display_name}</h1>
            <p className="text-sm text-ink-soft">
              @{p.username} · {p.is_public ? "Perfil público" : "Perfil privado"}
            </p>
          </div>
          {isMe ? (
            <Link href="/cuenta#privacidad" className="rounded-full border border-rule px-4 py-1.5 text-sm">
              Cambiar privacidad
            </Link>
          ) : (
            <FollowButton userId={p.id} state={state} isPublic={p.is_public} />
          )}
        </div>
        <p className="text-sm text-ink-soft">
          {counts?.followers ?? 0} {counts?.followers === 1 ? "seguidor" : "seguidores"} · sigue a {counts?.following ?? 0}
        </p>
      </section>

      {!canView ? (
        <p className="rounded-lg border border-rule px-4 py-5 text-sm">
          {state === "pendiente"
            ? `Has pedido seguir a ${p.display_name}. Cuando te acepte, verás su lista aquí.`
            : `El perfil de ${p.display_name} es privado. Pide seguirle para ver su lista.`}
        </p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-ink-soft">
          {p.shows === "recomendados" && !isMe ? `${p.display_name} aún no recomienda nada.` : "Su lista está vacía."}
        </p>
      ) : (
        <>
          <Group title="Lo recomienda" entries={liked} myItems={myItems} from={p} />
          <Group title="Ya lo conoce" entries={done} myItems={myItems} from={p} />
          <Group title="Lo tiene pendiente" entries={pending} myItems={myItems} from={p} />
        </>
      )}
    </div>
  );
}

function addHref(e: ProfileEntry, from: { username: string; display_name: string }) {
  const c = e.item;
  const de = { de: `@${from.username}`, de_nombre: from.display_name };
  if (c.source === "manual" || !c.source_id) return `/nuevo?${new URLSearchParams({ q: c.title, tipo: c.kind, ...de })}`;
  return `/nuevo?${new URLSearchParams({
    source: c.source,
    source_id: c.source_id,
    tipo: c.kind,
    title: c.title,
    ...(c.year ? { year: String(c.year) } : {}),
    ...(c.image_url ? { img: c.image_url } : {}),
    ...de,
  })}`;
}

function Group({
  title,
  entries,
  myItems,
  from,
}: {
  title: string;
  entries: ProfileEntry[];
  myItems: Map<string, string>;
  from: { id: string; username: string; display_name: string };
}) {
  if (!entries.length) return null;
  return (
    <section>
      <h2 className="border-b border-rule pb-2 text-sm font-semibold">
        {title} <span className="font-normal text-ink-soft">{entries.length}</span>
      </h2>
      <ul className="divide-y divide-rule">
        {entries.map((e) => {
          const c = e.item;
          const mineId = myItems.get(c.id);
          const meta = [
            KIND_LABEL[c.kind],
            ratingOf(c.extra, true),
            c.kind === "evento" ? null : c.year,
            c.creators?.[0] ?? c.address,
          ]
            .filter(Boolean)
            .join(", ");
          return (
            <li key={e.id} className="flex items-center gap-4 py-3">
              <Cover src={c.image_url} kind={c.kind} title={c.title} size="sm" />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="font-semibold leading-snug">{c.title}</span>
                <span className="truncate text-sm text-ink-soft">{meta}</span>
                {e.status === "hecho" && e.would_recommend === false && (
                  <span className="text-xs text-ink-soft">{doneLabel(c.kind)}, no lo recomendaría</span>
                )}
              </div>
              {mineId ? (
                <Link href={`/e/${mineId}`} className="shrink-0 text-sm text-ink-soft">
                  En tu lista
                </Link>
              ) : (
                <Link href={addHref(e, from)} className="shrink-0 rounded-full border border-stamp px-3 py-1 text-sm text-stamp">
                  Añadir
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
