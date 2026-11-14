import "server-only";
import type { Candidate, CatalogDetails, Kind } from "./types";
import { searchTmdb, tmdbDetails } from "./tmdb";
import { searchBooks, bookDetails, openLibraryDetails } from "./books";
import { placeDetails, placesEnabled, searchPlaces } from "./places";
import { searchRestaurants, osmDetails } from "./osm";
import { searchEvents, eventDetails } from "./events";

export async function searchCatalog(q: string, kind: Kind): Promise<Candidate[]> {
  switch (kind) {
    case "pelicula":
    case "serie":
    case "documental":
      return searchTmdb(q, kind);
    case "libro":
      return searchBooks(q);
    case "restaurante":
      // Sin clave de Google, los restaurantes se buscan en OpenStreetMap
      return placesEnabled() ? searchPlaces(q, "restaurante") : searchRestaurants(q);
    case "lugar":
      return placesEnabled() ? searchPlaces(q, "lugar") : [];
    case "evento":
      return searchEvents(q);
    default:
      return [];
  }
}

export async function fetchDetails(source: string, sourceId: string): Promise<CatalogDetails> {
  switch (source) {
    case "tmdb":
      return tmdbDetails(sourceId);
    case "google_books":
      return bookDetails(sourceId);
    case "openlibrary":
      return openLibraryDetails(sourceId);
    case "osm":
      return osmDetails(sourceId);
    case "esmadrid":
    case "madrid_agenda":
    case "bcn_agenda":
      return eventDetails(source, sourceId);
    case "google_places":
      return placeDetails(sourceId);
    default:
      throw new Error(`Fuente desconocida: ${source}`);
  }
}
