import "server-only";
import type { Candidate, CatalogDetails, Kind } from "./types";

// Google Places API (New): restaurantes y otros lugares (casas rurales, hoteles, museos…).
// Coste: la búsqueda pide solo campos del tramo "Pro"; la ficha (web, teléfono, horario, tramo
// "Enterprise") se pide una sola vez, al guardar. Cada tramo tiene un uso gratuito mensual.
// Condiciones: solo el place_id se puede guardar indefinidamente; antes de lanzar comercialmente
// hay que refrescar o dejar de guardar el resto de datos (ver README).

const API = "https://places.googleapis.com/v1";
const MADRID = { latitude: 40.4168, longitude: -3.7038 };

const SEARCH_FIELDS = [
  "places.id",
  "places.displayName",
  "places.shortFormattedAddress",
  "places.types",
  "places.primaryType",
  "places.primaryTypeDisplayName",
].join(",");

const DETAIL_FIELDS = [
  "id",
  "displayName",
  "formattedAddress",
  "types",
  "primaryType",
  "primaryTypeDisplayName",
  "googleMapsUri",
  "location",
  "websiteUri",
  "nationalPhoneNumber",
  "regularOpeningHours.weekdayDescriptions",
  "rating",
  "userRatingCount",
].join(",");

// Tipos de Google que cuentan como "Restaurantes" (comer y beber); el resto es "Otros lugares"
const FOOD_TYPES = new Set([
  "restaurant", "food", "cafe", "coffee_shop", "bar", "pub", "wine_bar", "bar_and_grill", "bakery",
  "meal_takeaway", "meal_delivery", "ice_cream_shop", "food_court", "sandwich_shop", "dessert_shop",
  "tea_house", "juice_shop", "confectionery", "cafeteria", "deli", "diner", "steak_house", "night_club",
]);

type Place = {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  shortFormattedAddress?: string;
  types?: string[];
  primaryType?: string;
  primaryTypeDisplayName?: { text: string };
  googleMapsUri?: string;
  location?: { latitude: number; longitude: number };
  websiteUri?: string;
  nationalPhoneNumber?: string;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  rating?: number;
  userRatingCount?: number;
};

export function placesEnabled() {
  return Boolean(process.env.GOOGLE_PLACES_API_KEY);
}

/** "Restaurantes" si es sitio de comer o beber; si no, "Otros lugares". */
export function kindOfPlace(p: Pick<Place, "types" | "primaryType">): Kind {
  const isFood = (t: string) => FOOD_TYPES.has(t) || t.endsWith("_restaurant");
  // Manda el tipo principal: un hotel o una casa rural con restaurante sigue siendo "Otro lugar"
  if (p.primaryType) return isFood(p.primaryType) ? "restaurante" : "lugar";
  return (p.types ?? []).some(isFood) ? "restaurante" : "lugar";
}

function headers(fields: string) {
  return {
    "Content-Type": "application/json",
    "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY!,
    "X-Goog-FieldMask": fields,
  };
}

async function logFailure(res: Response) {
  const body = await res.text().catch(() => "");
  const hint =
    res.status === 403
      ? " (¿Places API (New) habilitada, facturación activa y la clave permite esta API?)"
      : res.status === 429
        ? " (cupo agotado)"
        : "";
  console.warn(`[lugares] Google Places respondió ${res.status}${hint}`, body.slice(0, 300));
}

const CACHE_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; results: Candidate[] }>();

/**
 * Busca sitios. Una sola consulta sirve para las dos categorías:
 * se reparten por tipo, y `only` filtra si se ha elegido una.
 */
export async function searchPlaces(q: string, only?: "restaurante" | "lugar"): Promise<Candidate[]> {
  const key = q.trim().toLowerCase();
  const cached = cache.get(key);
  let all = cached && cached.at > Date.now() - CACHE_MS ? cached.results : null;
  if (!all) {
    const res = await fetch(`${API}/places:searchText`, {
      method: "POST",
      headers: headers(SEARCH_FIELDS),
      body: JSON.stringify({
        textQuery: q,
        languageCode: "es",
        regionCode: "ES",
        pageSize: 10,
        // Cerca de Madrid primero, pero sin excluir el resto (una casa rural puede estar lejos)
        locationBias: { circle: { center: MADRID, radius: 50000 } },
      }),
    }).catch((e) => {
      console.warn("[lugares] Google Places no responde:", (e as Error).message);
      return null;
    });
    if (!res) throw new Error("Google Places no responde");
    if (!res.ok) {
      await logFailure(res);
      throw new Error(`Google Places ${res.status}`);
    }
    const data = (await res.json()) as { places?: Place[] };
    all = (data.places ?? []).map((p) => ({
      source: "google_places" as const,
      source_id: p.id,
      kind: kindOfPlace(p),
      title: p.displayName?.text ?? "Sin nombre",
      subtitle: [p.primaryTypeDisplayName?.text, p.shortFormattedAddress].filter(Boolean).join(", ") || null,
      image_url: null,
    }));
    cache.set(key, { at: Date.now(), results: all });
  }
  return only ? all.filter((c) => c.kind === only) : all;
}

export async function placeDetails(id: string): Promise<CatalogDetails> {
  if (!/^[\w-]{10,300}$/.test(id)) throw new Error("Id de Google Places no válido");
  const res = await fetch(`${API}/places/${encodeURIComponent(id)}?languageCode=es&regionCode=ES`, {
    headers: headers(DETAIL_FIELDS),
  });
  if (!res.ok) {
    await logFailure(res);
    throw new Error(`Google Places ${res.status}`);
  }
  const p = (await res.json()) as Place;
  const name = p.displayName?.text ?? "Sin nombre";
  return {
    kind: kindOfPlace(p),
    source: "google_places",
    source_id: p.id,
    title: name,
    genres: p.primaryTypeDisplayName ? [p.primaryTypeDisplayName.text] : [],
    address: p.formattedAddress ?? null,
    links: {
      maps:
        p.googleMapsUri ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}&query_place_id=${p.id}`,
      ...(p.websiteUri ? { web: p.websiteUri } : {}),
    },
    extra: {
      lat: p.location?.latitude ?? null,
      lon: p.location?.longitude ?? null,
      phone: p.nationalPhoneNumber ?? null,
      // Ya viene en español y por días: "lunes: 13:00–16:00"
      hours_lines: p.regularOpeningHours?.weekdayDescriptions ?? null,
      place_type: p.primaryType ?? null,
      // Nota de Google en el momento de guardar (o de la última actualización)
      rating: p.rating ?? null,
      rating_count: p.userRatingCount ?? null,
      rated_at: new Date().toISOString().slice(0, 10),
    },
  };
}
