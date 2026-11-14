import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { searchCatalog } from "@/lib/catalog";
import { KINDS, type Kind } from "@/lib/catalog/types";
import { placesEnabled } from "@/lib/catalog/places";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const kind = request.nextUrl.searchParams.get("kind") as Kind;
  if (!KINDS.includes(kind)) return NextResponse.json({ error: "Tipo no válido" }, { status: 400 });
  if (q.length < 2) return NextResponse.json({ results: [], catalog: true });

  // Sin catálogo para ese tipo: la interfaz ofrece directamente el alta manual.
  const catalog =
    kind === "otro" ? false
    : kind === "restaurante" ? true
    : kind === "lugar" ? placesEnabled()
    : kind === "evento" ? true
    : kind === "libro" ? true
    : Boolean(process.env.TMDB_READ_TOKEN);

  try {
    const results = await searchCatalog(q, kind);
    return NextResponse.json({ results, catalog });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ results: [], catalog, error: "El catálogo no responde ahora" }, { status: 502 });
  }
}
