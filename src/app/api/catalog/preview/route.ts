import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchDetails } from "@/lib/catalog";

// Fuentes cuya ficha se puede pedir para curiosear sin coste.
// Google Places no: su ficha completa se paga por consulta (se pide solo al guardar).
const FREE = new Set(["tmdb", "google_books", "openlibrary", "osm", "esmadrid", "madrid_agenda", "bcn_agenda"]);

/** Ficha de un resultado del catálogo, sin guardarla, para ver si es lo que buscabas. */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const source = request.nextUrl.searchParams.get("source") ?? "";
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!FREE.has(source) || !id) return NextResponse.json({ details: null });
  try {
    return NextResponse.json({ details: await fetchDetails(source, id) });
  } catch (e) {
    console.warn("[vista previa]", source, (e as Error).message);
    return NextResponse.json({ details: null, error: "No se ha podido cargar la ficha" }, { status: 502 });
  }
}
