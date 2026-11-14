import "server-only";
import type { EventItem } from "./shared";

// Agenda cultural de Barcelona (Open Data BCN, CC BY 4.0). Se consulta a su buscador (CKAN datastore),
// sin descargar el fichero completo. Pendiente de ver una respuesta real para leer sus campos.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function barcelonaSearch(_q: string): Promise<EventItem[]> {
  return [];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function barcelonaById(_id: string): Promise<EventItem | undefined> {
  return undefined;
}
