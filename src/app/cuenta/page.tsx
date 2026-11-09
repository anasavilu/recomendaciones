import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "../actions";
import { PasswordForm, ProfileForm } from "./forms";

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

      <section className="flex flex-col gap-4 border-t border-rule pt-8">
        <h2 className="text-lg font-semibold">Contraseña</h2>
        <PasswordForm highlight={sp.restablecer === "1"} />
      </section>

      <form action={signOut} className="border-t border-rule pt-8">
        <button className="text-sm text-stamp underline underline-offset-4">Cerrar sesión</button>
      </form>
    </div>
  );
}
