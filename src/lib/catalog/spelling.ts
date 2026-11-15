import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { norm } from "../text";

const MODEL = "claude-haiku-5-5";
const cache = new Map<string, string | null>();

/** Parecido entre dos textos (0–1) por pares de letras: "the disident" ~ "the dissident". */
export function similarity(a: string, b: string): number {
  const pairs = (s: string) => {
    const t = norm(s).replace(/[^\p{L}\p{N} ]/gu, "");
    const out: string[] = [];
    for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2));
    return out;
  };
  const x = pairs(a);
  const y = pairs(b);
  if (!x.length || !y.length) return 0;
  const pool = [...y];
  let hits = 0;
  for (const p of x) {
    const i = pool.indexOf(p);
    if (i >= 0) {
      hits++;
      pool.splice(i, 1);
    }
  }
  return (2 * hits) / (x.length + y.length);
}

/** ¿Algún título se parece a lo que se ha escrito? (si no, puede que haya una errata) */
export function looksFound(q: string, titles: string[]): boolean {
  const nq = norm(q);
  return titles.some((t) => {
    const nt = norm(t);
    return nt.includes(nq) || (nt.length >= 4 && nq.includes(nt)) || similarity(nq, nt) >= 0.75;
  });
}

/**
 * Corrige erratas en el título de una peli o serie ("the disident" → "The Dissident").
 * Devuelve null si no hay corrección. Solo se llama cuando el catálogo no encuentra nada parecido.
 */
export async function fixTitle(q: string): Promise<string | null> {
  const key = norm(q);
  if (key.length < 4 || key.length > 80 || !process.env.ANTHROPIC_API_KEY) return null;
  if (cache.has(key)) return cache.get(key)!;
  let fixed: string | null = null;
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 5000, maxRetries: 0 });
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 60,
      system:
        "Recibes lo que alguien ha escrito en el buscador de una app para encontrar una película, serie o documental. " +
        "Si tiene erratas o está mal escrito y reconoces el título que busca, responde SOLO con ese título bien escrito " +
        "(el original o el usado en España). Si no reconoces ninguno o ya está bien, responde exactamente: -",
      messages: [{ role: "user", content: q }],
    });
    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim().replace(/^["«“']|["»”']$/g, "");
    if (text && text !== "-" && text.length <= 120 && norm(text) !== key) fixed = text;
  } catch (e) {
    console.warn("[erratas]", (e as Error).message);
    return null; // no se guarda: se puede reintentar
  }
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  cache.set(key, fixed);
  return fixed;
}
