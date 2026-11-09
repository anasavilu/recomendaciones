import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Recomendados",
    short_name: "Recomendados",
    description: "Lo que te recomiendan, y quién te lo recomendó.",
    start_url: "/",
    display: "standalone",
    background_color: "#f2f4f7",
    theme_color: "#f2f4f7",
    lang: "es",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
