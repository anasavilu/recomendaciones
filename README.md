# Recomendados

Libros, películas, series, documentales y restaurantes que te recomiendan, con quién te lo recomendó y tus etiquetas.

Stack: Next.js 16 (App Router) · Supabase (Postgres + login) · Tailwind 4 · PWA instalable.

## Puesta en marcha

1. **Supabase**: crea un proyecto (región UE). En *SQL Editor*, ejecuta en orden los archivos de `supabase/migrations/` (`0001_init.sql`, `0002_usuarios.sql`, `0003_lo_recomendaria.sql`).
2. En *Authentication → URL Configuration*: *Site URL* `http://localhost:3000` y en *Redirect URLs* `http://localhost:3000/auth/callback` (y la URL de producción cuando la haya). En *Authentication → Providers → Email*, deja activado *Email*; *Confirm email* puede estar activado (se pide confirmar el correo al registrarse) o no.
3. Copia `.env.example` a `.env.local` y rellena las claves.
4. `npm install` y `npm run dev` → http://localhost:3000

## Estructura

| Ruta | Qué hace |
|---|---|
| `src/app/page.tsx` | Tu lista: búsqueda, filtros por tipo y estado, etiquetas y personas |
| `src/app/nuevo/` | Añadir: buscar en catálogo o a mano, quién lo recomienda, etiquetas |
| `src/app/e/[id]/` | Ficha y edición |
| `src/app/login/` | Entrar con usuario o correo + contraseña, crear cuenta, recuperar contraseña |
| `src/app/cuenta/` | Nombre, @usuario, cambiar contraseña, cerrar sesión |
| `src/app/actions.ts` | Altas, cambios y bajas (server actions) |
| `src/lib/catalog/` | Conectores: TMDB, Google Books / Open Library, OpenStreetMap (restaurantes; Google Places preparado) |
| `src/proxy.ts` | Mantiene la sesión y manda a `/login` si no la hay |
| `supabase/migrations/` | Esquema, búsqueda (`search_entries`) y seguridad por fila |

## Modelo de datos

- `catalog_items`: fichas compartidas (una peli existe una vez aunque la guarden mil personas). Solo el servidor escribe aquí.
- `entries`: la lista de cada usuario (estado, notas, valoración).
- `profiles`: nombre y `@usuario` único de cada cuenta.
- `recommenders`: personas que te recomiendan cosas. Nombre libre ("Maribel Verdú") o enlazada a otro usuario (`@ana`). En los formularios se escriben como `@usuario`.
- `tags` + `entry_tags`, `entry_recommendations`: etiquetas y quién recomendó cada cosa.

## Pendiente antes de uso comercial

- **TMDB**: la clave gratuita es para uso no comercial; pedir licencia comercial.
- **Restaurantes (OpenStreetMap)**: datos ODbL, se pueden guardar citando la fuente (ya se cita en la ficha). Los servidores públicos de Photon y Nominatim son de uso razonable: con muchos usuarios, montar instancia propia o usar un proveedor. Antes de lanzar, identificar la app con un contacto real en las peticiones a Nominatim.
- **Google Places** (si se activa): de pago por uso y solo permite guardar el place_id; revisar condiciones.
- **RGPD**: aviso de privacidad, borrado de cuenta, encargado de tratamiento (Supabase en UE).

## Fases siguientes

2. Que @ana vea lo que ha recomendado a otros, y búsqueda en lenguaje natural con IA.
3. Bot de WhatsApp (API oficial de WhatsApp Business) que reutiliza `addEntry` y `search_entries`.
