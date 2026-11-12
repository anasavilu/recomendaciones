import Link from "next/link";
import { KIND_LABEL } from "@/lib/catalog/types";
import { doneLabel, personOf, type EntryRow as Row } from "@/lib/entry-format";
import { Cover } from "./cover";
import { RecommendedBy } from "./recommended-by";

export function EntryRow({ entry }: { entry: Row }) {
  const c = entry.catalog_items;
  const meta = [KIND_LABEL[c.kind], c.year, c.creators?.[0] ?? c.address].filter(Boolean).join(", ");
  const tags = entry.entry_tags.map((t) => t.tags.name);
  const who = entry.entry_recommendations.map((r) => personOf(r.recommenders));
  const faded = entry.status === "hecho" || entry.status === "descartado";

  return (
    <li>
      <Link href={`/e/${entry.id}`} className="flex gap-4 py-4 active:bg-rule/40">
        <Cover src={c.image_url} kind={c.kind} title={c.title} size="sm" />
        <div className={`flex min-w-0 flex-1 flex-col gap-1 ${faded ? "opacity-60" : ""}`}>
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="truncate text-[1.0625rem] font-semibold leading-snug">{c.title}</h3>
            {entry.status === "hecho" && <span className="shrink-0 text-sm text-ink-soft">{doneLabel(c.kind)}</span>}
            {entry.status === "en_curso" && <span className="shrink-0 text-sm text-stamp">Empezado</span>}
          </div>
          <p className="truncate text-sm text-ink-soft">{meta}</p>
          <RecommendedBy people={who} className="text-lg" />
          {tags.length > 0 && (
            <ul className="mt-0.5 flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <li key={t} className="rounded bg-mustard-soft px-1.5 py-0.5 text-xs text-ink">
                  {t}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Link>
    </li>
  );
}
