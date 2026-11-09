import type { Candidate } from "./types";

/** Lo que necesitamos de un resultado de libro, venga de Google Books u Open Library. */
export type BookHit = Candidate & { language?: string | null; hasCover: boolean; authors: string[] };

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

// Resúmenes, guías de lectura, análisis… que Google mezcla con el libro de verdad
const NOT_THE_BOOK =
  /\b(resumen|guia de lectura|guia didactica|analisis de|study guide|summary of|summary and analysis|cuaderno de actividades|sparknotes|cliffsnotes)\b/;

function score(b: BookHit): number {
  let s = 0;
  if (b.authors.length) s += 4;
  if (b.hasCover) s += 2;
  if (b.language === "es") s += 1;
  if (b.year) s += 1;
  if (NOT_THE_BOOK.test(norm(b.title))) s -= 6;
  return s;
}

/**
 * Ordena por calidad de ficha, quita ediciones repetidas (mismo título y autor)
 * y descarta las que no tienen autor si hay suficientes que sí lo tienen.
 * Respeta el orden de relevancia del catálogo dentro de la misma calidad.
 */
export function rankBooks(hits: BookHit[], limit = 10): BookHit[] {
  const scored = hits.map((b, i) => ({ b, s: score(b), i }));
  scored.sort((x, y) => y.s - x.s || x.i - y.i);

  const seen = new Set<string>();
  const unique: BookHit[] = [];
  for (const { b } of scored) {
    const key = `${norm(b.title)}|${norm(b.authors[0] ?? "")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(b);
  }

  const withAuthor = unique.filter((b) => b.authors.length);
  const result = withAuthor.length >= 3 ? withAuthor : unique;
  return result.filter((b) => !NOT_THE_BOOK.test(norm(b.title)) || result.length <= 3).slice(0, limit);
}

/** Si lo escrito es un ISBN (10 o 13 dígitos, con o sin guiones), devuelve solo los dígitos. */
export function asIsbn(q: string): string | null {
  const d = q.replace(/[\s-]/g, "");
  return /^(97[89])?\d{9}[\dXx]$/.test(d) ? d.toUpperCase() : null;
}
