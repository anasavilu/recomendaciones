# Recomendados

Libros, películas, series, documentales y restaurantes que te recomiendan, con quién te lo recomendó y tus etiquetas.

Stack: Next.js 16 (App Router) · Supabase (Postgres + login) · Tailwind 4 · PWA instalable.

## Puesta en marcha

1. **Supabase**: crea un proyecto (región UE). En *SQL Editor*, pega y ejecuta `supabase/migrations/0001_init.sql`.
2. En *Authentication → URL Configuration*, añade `http://localhost:3000/auth/callback` a *Redirect URLs* (y la URL de producción cuando la haya).
3. Copia `.env.example` a `.env.local` y rellena las claves.
4. `npm install` y `npm run dev` → http://localhost:3000

## Estructura

| Ruta | Qué hace |
|---|---|
| `src/app/page.tsx` | Tu lista: búsqueda, filtros por tipo y estado, etiquetas y personas |
| `src/app/nuevo/` | Añadir: buscar en catálogo o a mano, quién lo recomienda, etiquetas |
| `src/app/e/[id]/` | Ficha y edición |
| `src/app/actions.ts` | Altas, cambios y bajas (server actions) |
| `src/lib/catalog/` | Conectores: TMDB, Google Books / Open Library, Google Places |
| `src/proxy.ts` | Mantiene la sesión y manda a `/login` si no la hay |
| `supabase/migrations/` | Esquema, búsqueda (`search_entries`) y seguridad por fila |

## Modelo de datos

- `catalog_items`: fichas compartidas (una peli existe una vez aunque la guarden mil personas). Solo el servidor escribe aquí.
- `entries`: la lista de cada usuario (estado, notas, valoración).
- `recommenders`: personas que te recomiendan cosas. Nombre libre o, en la fase 2, enlazadas a otro usuario.
- `tags` + `entry_tags`, `entry_recommendations`: etiquetas y quién recomendó cada cosa.

## Pendiente antes de uso comercial

- **TMDB**: la clave gratuita es para uso no comercial; pedir licencia comercial.
- **Google Places**: de pago por uso y con límites de almacenamiento de datos; revisar condiciones.
- **RGPD**: aviso de privacidad, borrado de cuenta, encargado de tratamiento (Supabase en UE).

## Fases siguientes

2. Perfiles conectados ("viene de Ana") y búsqueda en lenguaje natural con IA.
3. Bot de WhatsApp (API oficial de WhatsApp Business) que reutiliza `addEntry` y `search_entries`.
