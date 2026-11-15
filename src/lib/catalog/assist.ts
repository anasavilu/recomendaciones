import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { Kind } from "./types";

const MODEL = "claude-haiku-5-5";

/** Kinds para los que se puede pedir ayuda a internet cuando el catálogo no lo tiene. */
export const ASSIST_KINDS: Kind[] = ["pelicula", "serie", "documental", "libro"];

export type Draft = {
  kind: Kind;
  title: string;
  original_title: string | null;
  year: number | null;
  creators: string[];
  genres: string[];
  summary: string | null;
  platforms: string[];
  link: string | null;
  sources: { title: string; url: string }[];
};

const WHAT: Record<string, string> = {
  pelicula: "una película",
  serie: "una serie",
  documental: "un documental (película o serie documental)",
  libro: "un libro",
};

const SYSTEM = `Ayudas a rellenar la ficha de algo que no está en los catálogos de una app de recomendaciones (en España).
Busca en internet lo que ha escrito la persona (puede tener erratas) y, con lo que encuentres en fuentes fiables, responde SOLO con un objeto JSON, sin texto antes ni después:
{"found": true, "kind": "pelicula" | "serie" | "documental" | "libro", "title": "título en España o el original", "original_title": "o null", "year": 2024, "creators": ["dirección/creación, o autoría si es libro"], "genres": ["en español, máximo 3"], "summary": "sinopsis propia en español, 2-3 frases, sin copiar literalmente", "platforms": ["dónde verla en España ahora, solo si lo has visto en una fuente"], "link": "URL de la página oficial o de una ficha fiable, o null"}
Si no encuentras nada fiable que encaje, responde exactamente {"found": false}. No inventes datos: deja null o [] lo que no hayas comprobado.`;

export class AssistError extends Error {}

/** Busca en internet y devuelve un borrador de ficha para revisar (o null si no lo encuentra). */
export async function draftFromWeb(q: string, kind: Kind, anyKind = false): Promise<Draft | null> {
  if (!process.env.ANTHROPIC_API_KEY) throw new AssistError("La ayuda aún no está configurada.");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 45_000, maxRetries: 1 });
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: `Busco ${anyKind ? "una película, serie, documental o libro" : WHAT[kind]}: «${q}»` },
  ];
  const sources = new Map<string, string>();
  let text = "";
  try {
    // Las búsquedas las hace la API; si se pausa a mitad (pause_turn), se le deja seguir
    for (let i = 0; i < 3; i++) {
      const res = await client.messages.create({
        model: MODEL,
        max_tokens: 1200,
        system: SYSTEM,
        messages,
        tools: [
          {
            type: "web_search_20250305",
            name: "web_search",
            max_uses: 3,
            user_location: { type: "approximate", country: "ES", timezone: "Europe/Madrid" },
          },
        ],
      });
      for (const b of res.content) {
        if (b.type === "web_search_tool_result" && Array.isArray(b.content))
          for (const r of b.content) if (r.type === "web_search_result") sources.set(r.url, r.title);
        if (b.type === "text") text += b.text;
      }
      if (res.stop_reason !== "pause_turn") break;
      messages.push({ role: "assistant", content: res.content });
      text = "";
    }
  } catch (e) {
    const msg = (e as Error).message ?? "";
    if (/web.?search/i.test(msg) && /(enable|disabled|not allowed|permission)/i.test(msg))
      throw new AssistError("La búsqueda en internet no está activada en la cuenta de Anthropic.");
    throw new AssistError("No he podido buscarlo ahora. Prueba otra vez en un momento.");
  }
  return parseDraft(text, kind, [...sources].map(([url, title]) => ({ url, title })));
}

const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const list = (v: unknown, n: number) =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim().slice(0, 80)))].slice(0, n) : [];

export function parseDraft(text: string, fallbackKind: Kind, allSources: { title: string; url: string }[]): Draft | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(m[0]);
  } catch {
    return null;
  }
  const title = str(o.title, 300);
  if (o.found !== true || !title) return null;
  const kind = ASSIST_KINDS.includes(o.kind as Kind) ? (o.kind as Kind) : fallbackKind;
  const year = typeof o.year === "number" && Number.isInteger(o.year) && o.year > 1000 && o.year < 2100 ? o.year : null;
  const link = str(o.link, 500);
  return {
    kind,
    title,
    original_title: str(o.original_title, 300),
    year,
    creators: list(o.creators, 4),
    genres: list(o.genres, 3),
    summary: str(o.summary, 1200),
    platforms: list(o.platforms, 5),
    link: link && /^https:\/\//.test(link) ? link : null,
    // Las fuentes son las páginas que de verdad ha consultado, no lo que diga el texto
    sources: allSources.filter((s) => /^https:\/\//.test(s.url)).slice(0, 3),
  };
}
