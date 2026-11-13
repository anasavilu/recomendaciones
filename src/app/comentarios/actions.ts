"use server";

import { createAdminClient, requireUser } from "@/lib/supabase/server";

export type FeedbackState = { ok?: boolean; error?: string };

const MAX = 4000;
const PER_HOUR = 10;

export async function sendFeedback(_prev: FeedbackState, fd: FormData): Promise<FeedbackState> {
  const { supabase, user } = await requireUser();
  const message = String(fd.get("message") ?? "").trim();
  const page = String(fd.get("page") ?? "").slice(0, 200) || null;
  if (!message) return { error: "Escribe tu comentario antes de enviarlo." };
  if (message.length > MAX) return { error: `Es demasiado largo: el máximo son ${MAX} caracteres.` };

  // Freno básico para no inundar el correo
  const admin = createAdminClient();
  const { count } = await admin
    .from("feedback")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", new Date(Date.now() - 3600_000).toISOString());
  if ((count ?? 0) >= PER_HOUR) return { error: "Has enviado muchos comentarios en poco tiempo. Prueba dentro de un rato." };

  const { data: row, error } = await supabase
    .from("feedback")
    .insert({ user_id: user.id, message, page })
    .select("id")
    .single();
  if (error) {
    console.warn("[comentarios] No se pudo guardar:", error.message);
    return { error: "No se ha podido enviar. Prueba otra vez en un momento." };
  }

  // Aviso por correo (si está configurado). Si falla, el comentario ya está guardado.
  const key = process.env.RESEND_API_KEY;
  const to = process.env.FEEDBACK_EMAIL;
  if (key && to) {
    const { data: profile } = await supabase.from("profiles").select("display_name,username").eq("id", user.id).single();
    const who = [profile?.display_name, profile?.username ? `@${profile.username}` : null, user.email]
      .filter(Boolean)
      .join(" · ");
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Recomendados <onboarding@resend.dev>",
        to: [to],
        reply_to: user.email ?? undefined,
        subject: `Comentario de ${profile?.display_name ?? "un usuario"} en Recomendados`,
        text: `${message}\n\n—\nDe: ${who}\nPantalla: ${page ?? "-"}\nFecha: ${new Date().toLocaleString("es-ES", { timeZone: "Europe/Madrid" })}`,
      }),
    }).catch((e) => {
      console.warn("[comentarios] Resend no responde:", (e as Error).message);
      return null;
    });
    if (res?.ok) await admin.from("feedback").update({ emailed: true }).eq("id", row.id);
    else if (res) console.warn(`[comentarios] Resend respondió ${res.status}:`, (await res.text()).slice(0, 300));
  }

  return { ok: true };
}
