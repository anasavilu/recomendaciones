import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { PeopleSearch } from "./people-search";
import { RequestButtons } from "./request-buttons";

type P = { id: string; username: string | null; display_name: string; is_public: boolean };

export default function PeoplePage() {
  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 sm:px-6">
      <header className="pt-6 pb-4">
        <Link href="/" className="text-sm text-ink-soft">
          ← Mi lista
        </Link>
      </header>
      <h1 className="mb-6 text-3xl font-semibold tracking-tight">Gente</h1>
      <PeopleSearch />
      <Suspense fallback={<p className="mt-8 text-ink-soft">Cargando…</p>}>
        <Lists />
      </Suspense>
    </main>
  );
}

async function Lists() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user!.id;
  const sel = "status, follower:profiles!follows_follower_id_fkey(id,username,display_name,is_public), followee:profiles!follows_followee_id_fkey(id,username,display_name,is_public)";
  const [{ data: out }, { data: inc }] = await Promise.all([
    supabase.from("follows").select(sel).eq("follower_id", me).order("created_at", { ascending: false }),
    supabase.from("follows").select(sel).eq("followee_id", me).order("created_at", { ascending: false }),
  ]);
  type Row = { status: string; follower: P; followee: P };
  const outgoing = (out ?? []) as unknown as Row[];
  const incoming = (inc ?? []) as unknown as Row[];
  const requests = incoming.filter((r) => r.status === "pendiente");
  const followers = incoming.filter((r) => r.status === "aceptado");

  return (
    <div className="mt-8 flex flex-col gap-8">
      {requests.length > 0 && (
        <People title="Quieren seguirte" people={requests.map((r) => r.follower)} action={(p) => <RequestButtons userId={p.id} pending />} />
      )}
      <People
        title="Sigues a"
        people={outgoing.map((r) => r.followee)}
        note={(p) => (outgoing.find((r) => r.followee.id === p.id)?.status === "pendiente" ? "Solicitud enviada" : null)}
        empty="Aún no sigues a nadie. Busca a alguien por su nombre o @usuario."
      />
      <People title="Te siguen" people={followers.map((r) => r.follower)} action={(p) => <RequestButtons userId={p.id} />} empty="Nadie te sigue todavía." />
    </div>
  );
}

function People({
  title,
  people,
  action,
  note,
  empty,
}: {
  title: string;
  people: P[];
  action?: (p: P) => React.ReactNode;
  note?: (p: P) => string | null;
  empty?: string;
}) {
  return (
    <section>
      <h2 className="border-b border-rule pb-2 text-sm font-semibold">
        {title} {people.length > 0 && <span className="font-normal text-ink-soft">{people.length}</span>}
      </h2>
      {people.length === 0 ? (
        <p className="py-4 text-sm text-ink-soft">{empty}</p>
      ) : (
        <ul className="divide-y divide-rule">
          {people.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-3">
              {p.username ? (
                <Link href={`/u/${p.username}`} className="min-w-0 flex-1">
                  <span className="hand text-2xl">{p.display_name}</span> <span className="text-sm text-ink-soft">@{p.username}</span>
                </Link>
              ) : (
                <span className="hand min-w-0 flex-1 text-2xl">{p.display_name}</span>
              )}
              {note?.(p) && <span className="shrink-0 text-sm text-ink-soft">{note(p)}</span>}
              {action?.(p)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
