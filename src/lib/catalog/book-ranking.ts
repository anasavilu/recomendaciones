import type { Candidate } from "./types";

/** Lo que necesitamos de un resultado de libro, venga de Google Books u Open Library. */
export type BookHit = Candidate & { language?: string | null; hasCover: boolean; authors: string[] };

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

// Palabras que no cuentan para decidir si un resultado encaja con lo buscado
const STOP = new Set(
  "el la los las un una unos unas de del al y e o u en a por para con sin que the of and an to in".split(" "),
);

// Resúmenes, guías de lectura, análisis… que Google mezcla con el libro de verdad
const NOT_THE_BOOK =
  /\b(resumen|guia de lectura|guia didactica|analisis de|study guide|summary of|summary and analysis|cuaderno de actividades|sparknotes|cliffsnotes)\b/;

function terms(q: string) {
  return norm(q).split(" ").filter((t) => t.length > 1 && !STOP.has(t));
}

/** Parte de las palabras buscadas que aparecen en el título o el autor (0 a 1). */
function coverage(b: BookHit, qTerms: string[]) {
  if (!qTerms.length) return 1;
  const words = new Set(norm(`${b.title} ${b.authors.join(" ")}`).split(" "));
  return qTerms.filter((t) => words.has(t)).length / qTerms.length;
}

function score(b: BookHit, cov: number): number {
  let s = cov * 6;
  if (b.authors.length) s += 4;
  if (b.language === "es") s += 3;
  if (b.hasCover) s += 2;
  if (b.year) s += 1;
  if (NOT_THE_BOOK.test(norm(b.title))) s -= 6;
  return s;
}

/**
 * Ordena por encaje con lo buscado, idioma y calidad de ficha; quita ediciones repetidas;
 * y descarta lo que no contiene todas las palabras o no tiene autor, si hay alternativas mejores.
 */
export function rankBooks(hits: BookHit[], q = "", limit = 10): BookHit[] {
  const qTerms = terms(q);
  const scored = hits.map((b, i) => {
    const cov = coverage(b, qTerms);
    return { b, cov, s: score(b, cov), i };
  });
  scored.sort((x, y) => y.s - x.s || x.i - y.i);

  const seen = new Set<string>();
  let list = scored.filter(({ b }) => {
    const key = `${norm(b.title)}|${norm(b.authors[0] ?? "")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const full = list.filter((x) => x.cov === 1);
  if (full.length >= 1) list = full;
  // Si hay ediciones en español, fuera las de otros idiomas (salvo inglés, por si es el original)
  if (list.some((x) => x.b.language === "es"))
    list = list.filter((x) => !x.b.language || x.b.language === "es" || x.b.language === "en");
  const withAuthor = list.filter((x) => x.b.authors.length);
  if (withAuthor.length >= 3) list = withAuthor;
  if (list.length > 3) list = list.filter((x) => !NOT_THE_BOOK.test(norm(x.b.title)));

  return list.slice(0, limit).map((x) => x.b);
}

/** Si lo escrito es un ISBN (10 o 13 dígitos, con o sin guiones), devuelve solo los dígitos. */
export function asIsbn(q: string): string | null {
  const d = q.replace(/[\s-]/g, "");
  return /^(97[89])?\d{9}[\dXx]$/.test(d) ? d.toUpperCase() : null;
}
