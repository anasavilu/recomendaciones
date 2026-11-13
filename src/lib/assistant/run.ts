import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { discoverOnPlatform, whereToWatch } from "@/lib/catalog/tmdb";

export const TOOLS: Anthropic.Tool[] = [
  {
    name: "buscar_en_plataforma",
    description:
      "Lista lo más popular que se puede ver AHORA con suscripción en una plataforma de streaming en España (Netflix, Prime Video, Disney+, Max, Movistar Plus+, Filmin, Apple TV+, SkyShowtime…). Úsala para sugerir títulos de una plataforma concreta. Puedes filtrar por géneros en español.",
    input_schema: {
      type: "object",
      properties: {
        plataforma: { type: "string", description: "Nombre de la plataforma, p. ej. «Netflix»" },
        tipo: { type: "string", enum: ["pelicula", "serie"] },
        generos: { type: "array", items: { type: "string" }, description: "Géneros en español, p. ej. [«Comedia», «Romance»]" },
      },
      required: ["plataforma", "tipo"],
    },
  },
  {
    name: "donde_ver",
    description:
      "Dice en qué plataformas de España se puede ver ahora una película o serie concreta (suscripción, alquiler o compra). Úsala antes de afirmar en qué plataforma está algo.",
    input_schema: {
      type: "object",
      properties: { titulo: { type: "string", description: "Título de la película o serie (con el año si lo sabes)" } },
      required: ["titulo"],
    },
  },
];

const MAX_ROUNDS = 4;

async function runTool(name: string, input: Record<string, unknown>): Promise<string> {
  try {
    if (name === "buscar_en_plataforma")
      return JSON.stringify(
        await discoverOnPlatform({
          plataforma: String(input.plataforma ?? ""),
          tipo: input.tipo === "serie" ? "serie" : "pelicula",
          generos: Array.isArray(input.generos) ? input.generos.map(String).slice(0, 4) : undefined,
        }),
      );
    if (name === "donde_ver") return JSON.stringify(await whereToWatch(String(input.titulo ?? "").slice(0, 200)));
    return JSON.stringify({ aviso: `Herramienta desconocida: ${name}` });
  } catch (e) {
    console.warn(`[asistente] Falló la herramienta ${name}:`, (e as Error).message);
    return JSON.stringify({ aviso: "El catálogo de plataformas no responde ahora." });
  }
}

/**
 * Conversación con herramientas: el texto se va enviando según llega;
 * si el modelo pide consultar plataformas, se consulta y se sigue.
 */
export async function runAssistant(opts: {
  client: Pick<Anthropic, "messages">;
  model: string;
  system: Anthropic.TextBlockParam[];
  messages: Anthropic.MessageParam[];
  onText: (delta: string) => void;
  signal?: AbortSignal;
}) {
  const convo = [...opts.messages];
  let emitted = "";
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const isLast = round === MAX_ROUNDS - 1;
    const stream = opts.client.messages.stream(
      {
        model: opts.model,
        max_tokens: 900,
        system: opts.system,
        // En la última ronda ya no se ofrecen herramientas: tiene que contestar
        ...(isLast ? {} : { tools: TOOLS }),
        messages: convo,
      },
      { signal: opts.signal },
    );
    // Separar con un salto de línea el texto de rondas distintas
    let first = true;
    stream.on("text", (delta) => {
      if (first && emitted && !emitted.endsWith("\n")) {
        opts.onText("\n\n");
        emitted += "\n\n";
      }
      first = false;
      emitted += delta;
      opts.onText(delta);
    });
    const final = await stream.finalMessage();
    if (final.stop_reason !== "tool_use") return;

    convo.push({ role: "assistant", content: final.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of final.content) {
      if (block.type !== "tool_use") continue;
      results.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: await runTool(block.name, block.input as Record<string, unknown>),
      });
    }
    convo.push({ role: "user", content: results });
  }
}
