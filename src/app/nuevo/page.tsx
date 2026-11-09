import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { AddForm } from "./add-form";
import { loadSuggestions } from "@/lib/entries";

export default function NewPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 sm:px-6">
      <header className="flex items-center justify-between pt-6 pb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Nueva recomendación</h1>
        <Link href="/" className="text-sm text-ink-soft">
          Cancelar
        </Link>
      </header>
      <Suspense>
        <WithSuggestions />
      </Suspense>
    </main>
  );
}

async function WithSuggestions() {
  const supabase = await createClient();
  const s = await loadSuggestions(supabase);
  return <AddForm tagSuggestions={s.tags} peopleSuggestions={s.people} />;
}
