import Link from "next/link";
import { FeedbackForm } from "./form";

export default function FeedbackPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 sm:px-6">
      <header className="pt-6 pb-4">
        <Link href="/" className="text-sm text-ink-soft">
          ← Mi lista
        </Link>
      </header>
      <h1 className="mb-2 text-3xl font-semibold tracking-tight">Comentarios</h1>
      <p className="mb-8 max-w-prose text-ink-soft">
        Cuéntanos qué mejorarías o qué no funciona. Lo leemos todo.
      </p>
      <FeedbackForm page="/comentarios" />
    </main>
  );
}
