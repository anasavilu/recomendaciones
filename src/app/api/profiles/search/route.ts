import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.replace(/^@/, "").length < 2) return NextResponse.json({ results: [] });

  const [{ data: rows, error }, { data: links }] = await Promise.all([
    supabase.rpc("find_profiles", { q }),
    supabase.from("follows").select("follower_id,followee_id").eq("status", "aceptado"),
  ]);
  if (error) return NextResponse.json({ results: [] }, { status: 500 });
  // Primero la gente que sigues o que te sigue (follows solo devuelve las tuyas)
  const close = new Set((links ?? []).flatMap((l) => [l.follower_id as string, l.followee_id as string]));
  const sorted = [...((rows ?? []) as { id: string }[])].sort((a, b) => Number(close.has(b.id)) - Number(close.has(a.id)));
  return NextResponse.json({
    results: (sorted as unknown as { username: string; display_name: string }[]).map((r) => ({
      token: `@${r.username}`,
      name: r.display_name,
      username: r.username,
    })),
  });
}
