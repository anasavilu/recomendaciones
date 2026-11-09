/** "Comedia Romántica " → "comedia romantica" para comparar nombres. */
export const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/\s+/g, " ");

/** Lista separada por comas → valores limpios y sin duplicados (respeta la primera forma escrita). */
export function splitList(raw: string | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of (raw ?? "").split(",")) {
    const v = part.trim().replace(/\s+/g, " ");
    if (!v || seen.has(norm(v))) continue;
    seen.add(norm(v));
    out.push(v);
  }
  return out;
}
