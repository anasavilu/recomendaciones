import type { Kind } from "@/lib/catalog/types";

const GLYPH: Record<Kind, string> = {
  pelicula: "🎬",
  serie: "📺",
  documental: "🎞️",
  libro: "📖",
  restaurante: "🍽️",
  lugar: "📍",
  evento: "🎭",
  otro: "✳️",
};

/** Portada del catálogo o, si no hay, un hueco con el tipo. Proporción de póster (2:3). */
export function Cover({ src, kind, title, size }: { src: string | null; kind: Kind; title: string; size: "sm" | "lg" }) {
  const box = size === "sm" ? "w-14 h-21" : "w-32 h-48 sm:w-40 sm:h-60";
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={`Portada de ${title}`} className={`${box} shrink-0 rounded-md object-cover bg-rule`} loading="lazy" />;
  }
  return (
    <div aria-hidden className={`${box} shrink-0 rounded-md bg-rule grid place-items-center ${size === "sm" ? "text-xl" : "text-4xl"}`}>
      {GLYPH[kind]}
    </div>
  );
}
