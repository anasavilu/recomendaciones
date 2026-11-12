import "server-only";
import type { Candidate, CatalogDetails, Kind } from "./types";
import { searchTmdb, tmdbDetails } from "./tmdb";
import { searchBooks, bookDetails, openLibraryDetails } from "./books";
import { placeDetails } from "./places";
import { searchRestaurants, osmDetails } from "./osm";

export async function searchCatalog(q: string, kind: Kind): Promise<Candidate[]> {
  switch (kind) {
    case "pelicula":
    case "serie":
    case "documental":
      return searchTmdb(q, kind);
    case "libro":
      return searchBooks(q);
    case "restaurante":
      return searchRestaurants(q);
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
    case "google_places":
      return placeDetails(sourceId);
    default:
      throw new Error(`Fuente desconocida: ${source}`);
  }
}
