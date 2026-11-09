import "server-only";
import type { Candidate, CatalogDetails } from "./types";

// Google Places API (New). De pago por uso: sin clave, los restaurantes se añaden a mano.
const API = "https://places.googleapis.com/v1";

type Place = {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  primaryTypeDisplayName?: { text: string };
  googleMapsUri?: string;
  websiteUri?: string;
  priceLevel?: string;
};

export function placesEnabled() {
  return Boolean(process.env.GOOGLE_PLACES_API_KEY);
}

export async function searchPlaces(q: string): Promise<Candidate[]> {
  if (!placesEnabled()) return [];
  const res = await fetch(`${API}/places:searchText`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY!,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.primaryTypeDisplayName",
    },
    body: JSON.stringify({ textQuery: q, languageCode: "es", regionCode: "ES", includedType: "restaurant", pageSize: 8 }),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { places?: Place[] };
  return (data.places ?? []).map((p) => ({
    source: "google_places",
    source_id: p.id,
    kind: "restaurante",
    title: p.displayName?.text ?? "Sin nombre",
    subtitle: p.formattedAddress ?? null,
    image_url: null,
  }));
}

export async function placeDetails(id: string): Promise<CatalogDetails> {
  const res = await fetch(`${API}/places/${encodeURIComponent(id)}?languageCode=es`, {
    headers: {
      "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY!,
      "X-Goog-FieldMask": "id,displayName,formattedAddress,primaryTypeDisplayName,googleMapsUri,websiteUri,priceLevel",
    },
  });
  if (!res.ok) throw new Error(`Google Places ${res.status}`);
  const p = (await res.json()) as Place;
  return {
    kind: "restaurante",
    source: "google_places",
    source_id: p.id,
    title: p.displayName?.text ?? "Sin nombre",
    genres: p.primaryTypeDisplayName ? [p.primaryTypeDisplayName.text] : [],
    address: p.formattedAddress ?? null,
    links: {
      ...(p.googleMapsUri ? { maps: p.googleMapsUri } : {}),
      ...(p.websiteUri ? { web: p.websiteUri } : {}),
    },
    extra: { price_level: p.priceLevel ?? null },
  };
}
