"use client";

import { useRouter } from "next/navigation";

/** Desplegable de filtro (género, plataforma…): cada opción lleva a su URL. */
export function FacetSelect({
  label,
  value,
  allLabel,
  allHref,
  options,
}: {
  label: string;
  value: string | null;
  allLabel: string;
  allHref: string;
  options: { value: string; count: number; href: string }[];
}) {
  const router = useRouter();
  const active = Boolean(value);
  return (
    <label className="relative inline-flex">
      <span className="sr-only">{label}</span>
      <select
        value={value ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          router.push(v ? options.find((o) => o.value === v)!.href : allHref, { scroll: false });
        }}
        className={`appearance-none rounded-full border py-1 pl-3 pr-7 text-[0.8125rem] leading-5 ${
          active ? "border-ink bg-ink text-paper" : "border-rule bg-sheet text-ink"
        }`}
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.value} ({o.count})
          </option>
        ))}
      </select>
      <span aria-hidden className={`pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[0.6rem] ${active ? "text-paper" : "text-ink-soft"}`}>
        ▼
      </span>
    </label>
  );
}
