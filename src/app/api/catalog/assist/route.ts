import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ASSIST_KINDS, AssistError, draftFromWeb } from "@/lib/catalog/assist";
import type { Kind } from "@/lib/catalog/types";

const PER_MINUTE = 4;
const recent = new Map<string, number[]>();
function tooMany(userId: string) {
  const now = Date.now();
  const list = (recent.get(userId) ?? []).filter((t) => now - t < 60_000);
  list.push(now);
  recent.set(userId, list);
  return list.length > PER_MINUTE;
}

export const maxDuration = 60;

/** «Búscalo por internet»: borrador de ficha para algo que no está en el catálogo. */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Tienes que entrar en tu cuenta." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { q?: string; kind?: Kind } | null;
  const q = (body?.q ?? "").trim().slice(0, 150);
  // Sin tipo (desde el buscador general): que lo averigüe la búsqueda
  const anyKind = !body?.kind;
  const kind = (body?.kind ?? "pelicula") as Kind;
  if (q.length < 2 || !ASSIST_KINDS.includes(kind)) return NextResponse.json({ error: "Escribe qué buscas." }, { status: 400 });
  if (tooMany(data.user.id)) return NextResponse.json({ error: "Espera un momento antes de volver a buscar." }, { status: 429 });

  try {
    const draft = await draftFromWeb(q, kind, anyKind);
    return NextResponse.json({ draft });
  } catch (e) {
    console.warn("[ayuda ficha]", (e as Error).message);
    const msg = e instanceof AssistError ? e.message : "No he podido buscarlo ahora.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
