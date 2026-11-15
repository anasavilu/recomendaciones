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

const GOOGLE_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

function popupHtml(p: MapPoint) {
  const lines = [
    `<strong>${esc(p.label ?? p.kindLabel)}</strong>`,
    p.label
      ? `<span style="color:#5b6480">${esc(p.kindLabel)}${p.done ? " · realizado" : ""}</span>`
      : p.done
        ? `<span style="color:#5b6480">Realizado</span>`
        : "",
    p.who.length ? `Recomendado por ${esc(p.who.join(", "))}` : "",
    p.tags.length ? `<span style="color:#5b6480">${esc(p.tags.join(", "))}</span>` : "",
    `<span style="display:flex;flex-wrap:wrap;gap:4px 14px"><a href="/e/${esc(p.id)}">Ver ficha</a>${p.mapsUrl ? `<a href="${esc(p.mapsUrl)}" target="_blank" rel="noopener noreferrer">Abrir en Google Maps</a>` : ""}</span>`,
  ].filter(Boolean);
  return `<div style="font:14px/1.45 system-ui,sans-serif;display:grid;gap:4px;color:#1b2440">${lines.join("")}</div>`;
}

/** Mapa con un punto por recomendación: Google Maps si hay clave; si no, OpenStreetMap. */
export function MapView({ points }: { points: MapPoint[] }) {
  return GOOGLE_KEY ? <GoogleMapView points={points} apiKey={GOOGLE_KEY} /> : <OsmMapView points={points} />;
}

// Carga del script de Google Maps una sola vez
let googleLoading: Promise<void> | null = null;
function loadGoogle(apiKey: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  if (w.google?.maps?.Map) return Promise.resolve();
  if (!googleLoading)
    googleLoading = new Promise<void>((resolve, reject) => {
      w.__recomendadosMapsReady = () => resolve();
      const s = document.createElement("script");
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&language=es&region=ES&loading=async&callback=__recomendadosMapsReady`;
      s.async = true;
      s.onerror = () => {
        googleLoading = null;
        reject(new Error("No se pudo cargar Google Maps"));
      };
      document.head.appendChild(s);
    });
  return googleLoading;
}

function GoogleMapView({ points, apiKey }: { points: MapPoint[]; apiKey: string }) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const created: any[] = [];
    loadGoogle(apiKey)
      .then(() => {
        if (cancelled || !el.current) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const g = (window as any).google.maps;
        const map = new g.Map(el.current, {
          center: { lat: 40.4168, lng: -3.7038 },
          zoom: 12,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
          gestureHandling: "greedy",
        });
        const info = new g.InfoWindow();
        const bounds = new g.LatLngBounds();
        for (const p of points) {
          const color = COLORS[p.kind];
          const marker = new g.Marker({
            map,
            position: { lat: p.lat, lng: p.lon },
            title: p.label ?? p.kindLabel,
            icon: {
              path: g.SymbolPath.CIRCLE,
              scale: 9,
              fillColor: color,
              fillOpacity: p.done ? 0.15 : 0.95,
              strokeColor: color,
              strokeWeight: 3,
            },
          });
          marker.addListener("click", () => {
            info.setContent(popupHtml(p));
            info.open({ map, anchor: marker });
          });
          created.push(marker);
          bounds.extend({ lat: p.lat, lng: p.lon });
        }
        if (points.length === 1) {
          map.setCenter({ lat: points[0].lat, lng: points[0].lon });
          map.setZoom(15);
        } else if (points.length > 1) map.fitBounds(bounds, 40);
      })
      .catch(() => {
        if (el.current) el.current.innerHTML = '<p style="padding:16px">No se ha podido cargar Google Maps.</p>';
      });
    return () => {
      cancelled = true;
      for (const m of created) m.setMap(null);
    };
  }, [points, apiKey]);

  return <div ref={el} className="h-[65dvh] w-full overflow-hidden rounded-xl border border-rule" />;
}

function OsmMapView({ points }: { points: MapPoint[] }) {
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
        marker.bindPopup(popupHtml(p));
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
