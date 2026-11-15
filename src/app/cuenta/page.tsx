import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "../actions";
import { PasswordForm, ProfileForm } from "./forms";
import { PrivacyForm } from "../gente/privacy-form";

export default function AccountPage({ searchParams }: PageProps<"/cuenta">) {
  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 sm:px-6">
      <header className="pt-6 pb-4">
        <Link href="/" className="text-sm text-ink-soft">
          ← Mi lista
        </Link>
      </header>
      <h1 className="mb-8 text-3xl font-semibold tracking-tight">Mi cuenta</h1>
      <Suspense fallback={<p className="text-ink-soft">Cargando…</p>}>
        <Account searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Account({ searchParams }: { searchParams: PageProps<"/cuenta">["searchParams"] }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name,username")
    .eq("id", auth.user!.id)
    .single();

  // Por separado: si aún no se ha aplicado la migración 0008, el resto de la página funciona igual
  const { data: privacy } = await supabase.from("profiles").select("is_public,shows").eq("id", auth.user!.id).maybeSingle();
  const { count: requests } = await supabase
    .from("follows")
    .select("follower_id", { count: "exact", head: true })
    .eq("followee_id", auth.user!.id)
    .eq("status", "pendiente");

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        {profile?.username ? (
          <p>
            Te encuentran como <span className="hand text-2xl">{profile.display_name}</span>{" "}
            <span className="text-ink-soft">@{profile.username}</span>
          </p>
        ) : (
          <p className="rounded-lg bg-mustard-soft px-4 py-3 text-sm">
            Elige un usuario para que los demás puedan poner que una recomendación viene de ti.
          </p>
        )}
        <ProfileForm name={profile?.display_name ?? ""} username={profile?.username ?? ""} />
        <p className="text-sm text-ink-soft">Correo: {auth.user!.email}</p>
      </section>

      <section className="flex flex-col gap-3 border-t border-rule pt-8">
        <h2 className="text-lg font-semibold">Gente</h2>
        <p className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <Link href="/gente" className="underline underline-offset-4">
            Buscar personas y ver a quién sigues
          </Link>
          {requests ? (
            <Link href="/gente" className="font-semibold text-stamp underline underline-offset-4">
              {requests === 1 ? "1 solicitud para seguirte" : `${requests} solicitudes para seguirte`}
            </Link>
          ) : null}
          {profile?.username && (
            <Link href={`/u/${profile.username}`} className="underline underline-offset-4">
              Ver mi perfil
            </Link>
          )}
        </p>
      </section>

      <section id="privacidad" className="flex flex-col gap-4 border-t border-rule pt-8">
        <h2 className="text-lg font-semibold">Privacidad</h2>
        <PrivacyForm isPublic={privacy?.is_public ?? true} shows={privacy?.shows === "recomendados" ? "recomendados" : "todo"} />
      </section>

      <section className="flex flex-col gap-4 border-t border-rule pt-8">
        <h2 className="text-lg font-semibold">Contraseña</h2>
        <PasswordForm highlight={sp.restablecer === "1"} />
      </section>

      <section className="flex flex-col gap-2 border-t border-rule pt-8">
        <h2 className="text-lg font-semibold">Comentarios</h2>
        <p className="text-sm text-ink-soft">
          ¿Algo que no funciona o una idea?{" "}
          <Link href="/comentarios" className="text-ink underline underline-offset-4">
            Envíanos un comentario
          </Link>
        </p>
      </section>

      <form action={signOut} className="border-t border-rule pt-8">
        <button className="text-sm text-stamp underline underline-offset-4">Cerrar sesión</button>
      </form>
    </div>
  );
}
