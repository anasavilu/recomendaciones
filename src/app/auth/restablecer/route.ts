import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Vuelta desde el correo de "He olvidado mi contraseña".
 * Ruta propia y sin parámetros, para que Supabase la reconozca en su lista de direcciones permitidas.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/cuenta?restablecer=1", request.url));
  }
  return NextResponse.redirect(new URL("/login?error=enlace", request.url));
}
