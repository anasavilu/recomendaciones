"use client";

import { useEffect, useState } from "react";
import { NavLink } from "./nav-link";

export type FilterOption = { label: React.ReactNode; href: string; active: boolean; key: string };
export type FilterSection = { title: string; options: FilterOption[] };

/**
 * Botón «Filtros» que abre un panel desde abajo. Cada opción cambia la lista al momento
 * (la lista se ve detrás) y el panel sigue abierto hasta pulsar «Ver resultados».
 */
export function FilterSheet({
  sections,
  activeCount,
  clearHref,
  resultCount,
}: {
  sections: FilterSection[];
  activeCount: number;
  clearHref: string;
  resultCount: number;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!sections.length) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`-mb-px ml-auto inline-flex items-center gap-1.5 border-b-2 pb-2 ${
          activeCount ? "border-ink font-semibold text-ink" : "border-transparent text-ink-soft"
        }`}
      >
        <svg aria-hidden width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M2 4h12M4.5 8h7M7 12h2" />
        </svg>
        Filtros
        {activeCount > 0 && (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-ink px-1 text-xs text-paper">{activeCount}</span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-40 flex items-end justify-center" role="dialog" aria-modal="true" aria-label="Filtros">
          <button type="button" aria-label="Cerrar filtros" onClick={() => setOpen(false)} className="absolute inset-0 bg-black/40" />
          <div className="relative flex max-h-[85dvh] w-full max-w-2xl flex-col rounded-t-2xl bg-paper shadow-2xl">
            <div className="flex items-center justify-between border-b border-rule px-5 py-4">
              <h2 className="text-lg font-semibold">Filtros</h2>
              <button type="button" onClick={() => setOpen(false)} className="text-sm text-ink-soft">
                Cerrar
              </button>
            </div>

            <div className="flex flex-col gap-6 overflow-y-auto px-5 py-5">
              {sections.map((s) => (
                <section key={s.title} className="flex flex-col gap-2">
                  <h3 className="text-sm text-ink-soft">{s.title}</h3>
                  <ul className="flex flex-wrap gap-2">
                    {s.options.map((o) => (
                      <li key={o.key}>
                        <NavLink
                          href={o.href}
                          replace
                          aria-current={o.active ? "true" : undefined}
                          className={`inline-flex items-center rounded-full border px-3 py-1.5 text-sm ${
                            o.active ? "border-ink bg-ink text-paper" : "border-rule bg-sheet text-ink"
                          }`}
                        >
                          {o.label}
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-rule px-5 py-4">
              {activeCount > 0 ? (
                <NavLink href={clearHref} replace className="text-sm text-ink-soft underline underline-offset-4">
                  Quitar filtros
                </NavLink>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full bg-stamp px-5 py-2.5 text-sm font-semibold text-stamp-ink"
              >
                Ver {resultCount === 1 ? "1 resultado" : `${resultCount} resultados`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
