import Anthropic from "@anthropic-ai/sdk";
import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildListContext } from "@/lib/assistant/context";
import { systemPrompt } from "@/lib/assistant/prompt";
import { runAssistant } from "@/lib/assistant/run";

const MODEL = "claude-haiku-5-5";
const MAX_TURNS = 12; // mensajes de historial que se envían
const MAX_CHARS = 1500; // por mensaje
const PER_MINUTE = 10;

// Freno sencillo por usuario (en memoria; suficiente con un solo servidor)
const recent = new Map<string, number[]>();
function tooMany(userId: string) {
  const now = Date.now();
  const list = (recent.get(userId) ?? []).filter((t) => now - t < 60_000);
  list.push(now);
  recent.set(userId, list);
  return list.length > PER_MINUTE;
}

type ChatMessage = { role: "user" | "assistant"; content: string };

function plain(text: string, status = 200) {
  return new Response(text, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return plain("Tienes que entrar en tu cuenta.", 401);
  if (!process.env.ANTHROPIC_API_KEY) return plain("El asistente aún no está configurado.", 503);
  if (tooMany(auth.user.id)) return plain("Vas muy rápido. Espera un momento y vuelve a preguntar.", 429);

  const body = (await request.json().catch(() => null)) as { messages?: ChatMessage[] } | null;
  const messages = (body?.messages ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-MAX_TURNS)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
  // La conversación tiene que empezar y terminar con un mensaje de la persona
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (!messages.length || messages[messages.length - 1].role !== "user") return plain("Escribe una pregunta.", 400);

  const list = await buildListContext(supabase, auth.user.id);
  const today = new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Madrid" });

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const system: Anthropic.TextBlockParam[] = [
      { type: "text", text: systemPrompt(list.name, today) },
      {
        type: "text",
        text: `Su lista (${list.count} elementos, del más reciente al más antiguo):\n${list.text}`,
        // La lista se repite en cada pregunta de la conversación: se cachea para que salga más barato
        cache_control: { type: "ephemeral" },
      },
  ];

  const encoder = new TextEncoder();
  const abort = new AbortController();
  const readable = new ReadableStream({
    start(controller) {
      runAssistant({
        client,
        model: MODEL,
        system,
        messages,
        signal: abort.signal,
        onText: (delta) => controller.enqueue(encoder.encode(delta)),
      })
        .then(() => controller.close())
        .catch((e: unknown) => {
          if (abort.signal.aborted) return;
          console.warn("[asistente] Error de la API de Claude:", e instanceof Error ? e.message : e);
          controller.enqueue(encoder.encode("\n\n(No he podido terminar la respuesta. Prueba otra vez.)"));
          controller.close();
        });
    },
    cancel() {
      abort.abort();
    },
  });
  return new Response(readable, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
