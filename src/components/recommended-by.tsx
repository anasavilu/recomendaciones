import type { Person } from "@/lib/entry-format";

/** "de Ana y Maribel", escrito a mano. Los usuarios de la app llevan su @. */
export function RecommendedBy({ people, className = "" }: { people: Person[]; className?: string }) {
  if (!people.length) return null;
  return (
    <span className={`hand ${className}`}>
      de{" "}
      {people.map((p, i) => (
        <span key={p.token}>
          {i > 0 && (i === people.length - 1 ? " y " : ", ")}
          {p.name}
          {p.username && <span className="font-sans text-[0.6em] text-ink-soft"> @{p.username}</span>}
        </span>
      ))}
    </span>
  );
}
