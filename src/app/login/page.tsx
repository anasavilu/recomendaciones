import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-10 px-6 py-12">
      <div className="flex flex-col gap-3">
        <h1 className="text-4xl font-semibold tracking-tight">Recomendados</h1>
        <p className="text-lg text-ink-soft">
          Esa serie que te dijo tu hermana, el libro de tu compañero, el bar que te descubrió tu prima.{" "}
          <span className="hand text-2xl">Todo apuntado.</span>
        </p>
      </div>
      <Suspense>
        <LinkErrorAware searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function LinkErrorAware({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const sp = await searchParams;
  return <LoginForm linkError={sp.error === "enlace"} />;
}
