"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Hit = { token: string; name: string; username: string };

/** Buscar usuarios de Recomendados por nombre o @usuario. */
export function PeopleSearch() {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<{ q: string; hits: Hit[] }>({ q: "", hits: [] });
  const term = q.trim();
  const active = term.replace(/^@/, "").length >= 2;

  useEffect(() => {
    if (!active) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/profiles/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        setRes({ q: term, hits: (await r.json()).results ?? [] });
      } catch {
        /* sin resultados */
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [active, term]);

  const hits = active && res.q === term ? res.hits : null;
  return (
    <div role="search" className="flex flex-col gap-2">
      <label htmlFor="buscar-gente" className="sr-only">
        Buscar personas
      </label>
      <input
        id="buscar-gente"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Busca por nombre o @usuario"
        autoComplete="off"
        className="w-full rounded-full border border-rule bg-sheet px-5 py-3 text-base"
      />
      {active && (
        <ul className="divide-y divide-rule">
          {hits === null ? (
            <li className="py-3 text-sm text-ink-soft">Buscando…</li>
          ) : hits.length === 0 ? (
            <li className="py-3 text-sm text-ink-soft">No hay nadie con «{term}».</li>
          ) : (
            hits.map((h) => (
              <li key={h.username}>
                <Link href={`/u/${h.username}`} className="block py-3">
                  <span className="hand text-2xl">{h.name}</span> <span className="text-sm text-ink-soft">@{h.username}</span>
                </Link>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
