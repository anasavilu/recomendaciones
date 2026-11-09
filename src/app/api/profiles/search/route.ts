import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.replace(/^@/, "").length < 2) return NextResponse.json({ results: [] });

  const { data: rows, error } = await supabase.rpc("find_profiles", { q });
  if (error) return NextResponse.json({ results: [] }, { status: 500 });
  return NextResponse.json({
    results: (rows ?? []).map((r: { username: string; display_name: string }) => ({
      token: `@${r.username}`,
      name: r.display_name,
      username: r.username,
    })),
  });
}
