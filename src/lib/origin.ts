import "server-only";
import { headers } from "next/headers";

/** URL base de la app para los enlaces de los correos. */
export async function siteOrigin() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}

export const USERNAME_RE = /^[a-z0-9._]{3,24}$/;
