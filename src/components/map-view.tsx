"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";

export type MapPoint = {
  id: string;
  lat: number;
  lon: number;
  kind: "restaurante" | "lugar" | "evento";
  done: boolean;
  /** Solo para datos que podemos mostrar sobre un mapa (no los de Google Places) */
  label: string | null;
  kindLabel: string;
  who: string[];
  tags: string[];
  mapsUrl: string | null;
};

const COLORS: Record<MapPoint["kind"], string> = { restaurante: "#b8336a", lugar: "#1b2440", evento: "#c9971c" };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Mapa de OpenStreetMap con un punto por recomendación. */
export function MapView({ points }: { points: MapPoint[] }) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let map: import("leaflet").Map | null = null;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !el.current) return;
      map = L.map(el.current, { zoomControl: true, attributionControl: true });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      const layer = L.featureGroup().addTo(map);
      for (const p of points) {
        const color = COLORS[p.kind];
        const marker = L.circleMarker([p.lat, p.lon], {
          radius: 9,
          color,
          weight: 3,
          fillColor: color,
          fillOpacity: p.done ? 0.15 : 0.9,
        });
        const lines = [
          `<strong>${esc(p.label ?? p.kindLabel)}</strong>`,
          p.label ? `<span style="color:#5b6480">${esc(p.kindLabel)}${p.done ? " · realizado" : ""}</span>` : p.done ? `<span style="color:#5b6480">Realizado</span>` : "",
          p.who.length ? `Recomendado por ${esc(p.who.join(", "))}` : "",
          p.tags.length ? `<span style="color:#5b6480">${esc(p.tags.join(", "))}</span>` : "",
          `<span style="display:flex;flex-wrap:wrap;gap:4px 14px"><a href="/e/${esc(p.id)}">Ver ficha</a>${p.mapsUrl ? `<a href="${esc(p.mapsUrl)}" target="_blank" rel="noopener noreferrer">Abrir en Google Maps</a>` : ""}</span>`,
        ].filter(Boolean);
        marker.bindPopup(`<div style="font:14px/1.45 system-ui,sans-serif;display:grid;gap:4px">${lines.join("")}</div>`);
        marker.addTo(layer);
      }
      if (points.length) map.fitBounds(layer.getBounds(), { padding: [30, 30], maxZoom: 15 });
      else map.setView([40.4168, -3.7038], 12);
    })();
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [points]);

  return <div ref={el} className="h-[65dvh] w-full overflow-hidden rounded-xl border border-rule" />;
}
