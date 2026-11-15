import Link from "next/link";
import type { Person } from "@/lib/entry-format";

/** "Recomendado por Ana @ana y Maribel". Si nadie lo recomendó, no muestra nada. */
/** `linkUsers`: los @usuarios enlazan a su perfil (no usarlo dentro de otro enlace). */
export function RecommendedBy({ people, className = "", linkUsers = false }: { people: Person[]; className?: string; linkUsers?: boolean }) {
  if (!people.length) return null;
  return (
    <span className={className}>
      <span className="font-sans text-[0.8125rem] text-ink-soft">Recomendado por </span>
      {people.map((p, i) => (
        <span key={p.token}>
          {i > 0 && <span className="font-sans text-[0.8125rem] text-ink-soft">{i === people.length - 1 ? " y " : ", "}</span>}
          <span className="hand">{p.name}</span>
          {p.username &&
            (linkUsers ? (
              <Link href={`/u/${p.username}`} className="font-sans text-[0.8125rem] text-ink-soft underline underline-offset-2">
                {" "}@{p.username}
              </Link>
            ) : (
              <span className="font-sans text-[0.8125rem] text-ink-soft"> @{p.username}</span>
            ))}
        </span>
      ))}
    </span>
  );
}
