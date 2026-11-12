import "server-only";
import type { Candidate, CatalogDetails } from "./types";

// Restaurantes desde OpenStreetMap:
// - búsqueda con Photon (photon.komoot.io): pensado para buscar mientras se escribe
// - ficha con Nominatim (lookup): cocina, web, horario, teléfono
// Datos © colaboradores de OpenStreetMap (ODbL): se pueden guardar citando la fuente.
// Los servidores públicos son de uso razonable; para lanzar a gran escala, instancia propia.

const PHOTON = "https://photon.komoot.io/api/";
const NOMINATIM = "https://nominatim.openstreetmap.org/lookup";
const UA = "Recomendados/0.1 (app de recomendaciones personales)";

// Centro de Madrid: sesgo de cercanía por defecto
const BIAS = { lat: "40.4168", lon: "-3.7038" };

// Sitios de comer y beber que aceptamos
const FOOD = ["restaurant", "cafe", "bar", "pub", "fast_food", "ice_cream", "food_court", "biergarten"];

const PLACE_LABEL: Record<string, string> = {
  restaurant: "Restaurante",
  cafe: "Cafetería",
  bar: "Bar",
  pub: "Pub",
  fast_food: "Comida rápida",
  ice_cream: "Heladería",
  food_court: "Zona de restauración",
  biergarten: "Cervecería",
};

const CUISINE: Record<string, string> = {
  spanish: "española", regional: "regional", tapas: "tapas", mediterranean: "mediterránea",
  italian: "italiana", pizza: "pizza", japanese: "japonesa", sushi: "sushi", ramen: "ramen",
  chinese: "china", asian: "asiática", thai: "tailandesa", vietnamese: "vietnamita", korean: "coreana",
  indian: "india", mexican: "mexicana", peruvian: "peruana", argentinian: "argentina", latin_american: "latinoamericana",
  french: "francesa", greek: "griega", turkish: "turca", lebanese: "libanesa", arab: "árabe", moroccan: "marroquí",
  american: "americana", burger: "hamburguesas", steak_house: "carnes", grill: "parrilla", seafood: "marisco",
  fish: "pescado", vegetarian: "vegetariana", vegan: "vegana", coffee_shop: "café", breakfast: "desayunos",
  brunch: "brunch", sandwich: "bocadillos", kebab: "kebab", chicken: "pollo", international: "internacional",
  galician: "gallega", basque: "vasca", asturian: "asturiana", catalan: "catalana", andalusian: "andaluza",
};

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const STOP = new Set("el la los las de del y en restaurante bar the".split(" "));

type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: {
    osm_id: number;
    osm_type: "N" | "W" | "R";
    osm_key: string;
    osm_value: string;
    name?: string;
    street?: string;
    housenumber?: string;
    postcode?: string;
    city?: string;
    district?: string;
    locality?: string;
    countrycode?: string;
    extra?: Record<string, string>;
  };
};

function addressOf(p: PhotonFeature["properties"]) {
  const street = [p.street, p.housenumber].filter(Boolean).join(" ");
  const area = p.district ?? p.locality;
  return [street, area, p.city].filter(Boolean).join(", ");
}

const CACHE_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; results: Candidate[] }>();

export async function searchRestaurants(q: string): Promise<Candidate[]> {
  const key = q.trim().toLowerCase();
  const hit = cache.get(key);
  if (hit && hit.at > Date.now() - CACHE_MS) return hit.results;
  const results = await searchPhoton(q);
  cache.set(key, { at: Date.now(), results });
  return results;
}

async function searchPhoton(q: string): Promise<Candidate[]> {
  const url = new URL(PHOTON);
  url.searchParams.set("q", q);
  url.searchParams.set("limit", "20");
  url.searchParams.set("lat", BIAS.lat);
  url.searchParams.set("lon", BIAS.lon);
  for (const v of FOOD) url.searchParams.append("osm_tag", `amenity:${v}`);

  const res = await fetch(url, { headers: { "User-Agent": UA } }).catch((e) => {
    console.warn("[restaurantes] Photon no responde:", (e as Error).message);
    return null;
  });
  if (!res?.ok) {
    if (res) console.warn(`[restaurantes] Photon respondió ${res.status}`);
    throw new Error("Catálogo de restaurantes no disponible");
  }
  const data = (await res.json()) as { features?: PhotonFeature[] };

  // El nombre (o la dirección) tiene que contener todas las palabras buscadas
  const terms = norm(q).split(" ").filter((t) => t.length > 1 && !STOP.has(t));
  return (data.features ?? [])
    .filter((f) => f.properties.osm_key === "amenity" && FOOD.includes(f.properties.osm_value) && f.properties.name)
    .filter((f) => {
      const words = norm(`${f.properties.name} ${addressOf(f.properties)}`);
      return terms.every((t) => words.includes(t));
    })
    .slice(0, 8)
    .map((f): Candidate => {
      const p = f.properties;
      const address = addressOf(p);
      const label = PLACE_LABEL[p.osm_value] ?? "Restaurante";
      return {
        source: "osm",
        source_id: `${p.osm_type}${p.osm_id}`,
        kind: "restaurante",
        title: p.name!,
        subtitle: [label === "Restaurante" ? null : label, address].filter(Boolean).join(", ") || null,
        image_url: null,
      };
    });
}

type NominatimPlace = {
  name?: string;
  display_name: string;
  type: string;
  lat: string;
  lon: string;
  osm_type: string;
  osm_id: number;
  address?: Record<string, string>;
  extratags?: Record<string, string>;
};

export async function osmDetails(sourceId: string): Promise<CatalogDetails> {
  if (!/^[NWR]\d{1,12}$/.test(sourceId)) throw new Error("Id de OpenStreetMap no válido");
  const url = new URL(NOMINATIM);
  url.searchParams.set("osm_ids", sourceId);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("extratags", "1");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("accept-language", "es");
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const [p] = (await res.json()) as NominatimPlace[];
  if (!p) throw new Error("Sitio no encontrado en OpenStreetMap");

  const a = p.address ?? {};
  const t = p.extratags ?? {};
  const name = p.name || a.amenity || p.display_name.split(",")[0];
  const street = [a.road, a.house_number].filter(Boolean).join(" ");
  const address = [street, a.suburb ?? a.neighbourhood ?? a.quarter, a.city ?? a.town ?? a.village]
    .filter(Boolean)
    .join(", ");
  const cuisines = (t.cuisine ?? "")
    .split(/[;,]/)
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean)
    .map((c) => CUISINE[c] ?? c.replace(/_/g, " "));
  const typeLabel = PLACE_LABEL[p.type];
  const osmPath = { N: "node", W: "way", R: "relation" }[sourceId[0] as "N" | "W" | "R"];
  const website = t.website ?? t["contact:website"];

  return {
    kind: "restaurante",
    source: "osm",
    source_id: sourceId,
    title: name,
    genres: [...(typeLabel && typeLabel !== "Restaurante" ? [typeLabel] : []), ...cuisines],
    address: address || p.display_name,
    links: {
      maps: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${address}`)}`,
      ...(website && /^https?:\/\//.test(website) ? { web: website } : {}),
      osm: `https://www.openstreetmap.org/${osmPath}/${sourceId.slice(1)}`,
    },
    extra: {
      lat: Number(p.lat),
      lon: Number(p.lon),
      opening_hours: t.opening_hours ?? null,
      phone: t.phone ?? t["contact:phone"] ?? null,
      place_type: p.type,
    },
  };
}
