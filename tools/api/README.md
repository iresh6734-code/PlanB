# Inventario de la API

Genera [`docs/api.md`](../../docs/api.md) a partir de los **servidores reales**, no de una lista escrita a mano.

```bash
node tools/api/inventory.mjs            # regenera docs/api.md
node tools/api/inventory.mjs --check    # código 1 si docs/api.md no coincide (lista rutas nuevas y retiradas)
node tools/api/inventory.mjs --json     # inventario completo con archivo y línea de cada ruta
node tools/api/inventory.mjs --entries main,runtime --out otra-ruta.md
```

## Cómo funciona

1. Para cada entrada (`server/main.ts` y `server/runtime.ts`) se crea una carpeta temporal nueva con datos vacíos. El proceso se lanza con esa carpeta como directorio de trabajo, así que no lee el `.env.local` del repositorio.
2. El proceso arranca con `NODE_ENV=test`, solo las variables de entorno imprescindibles y la red exterior bloqueada (`scripts/block-external.cjs`).
3. `capture-register.mjs` registra un gancho de resolución (`module.registerHooks`). Cuando un módulo de `server/` importa `fastify`, recibe `fastify-capture.mjs`, que:
   - anota cada ruta con el archivo y la línea de `server/` que la declara;
   - al llamar a `listen`, escribe la lista y termina el proceso sin abrir puertos ni publicar `.endpoint.json`. El inventario lo verifica con `app.server.listening`.
4. `inventory.mjs` une las entradas y escribe el documento. En el documento el origen va sin número de línea, para que mover código dentro de un archivo no lo deje desactualizado; `--json` sí conserva la línea.

## Límites

- Solo aparecen las rutas registradas con la configuración por defecto de cada entrada; faltan las que dependen de credenciales (por ejemplo, OAuth de HubSpot). El servicio de equipo está aparcado en la rama `archivo/aparcado-2026-11-22`.
- No incluye los servidores propios de la sala y la cápsula de rescate (`server/rescue-room-api.ts`, `server/rescue-capsule-api.ts`), que solo arrancan desde `scripts/demo-*.ts`.
- No aparece la ruta de archivos estáticos `/*`, porque la carpeta temporal no tiene `dist/`.
- `HEAD` se omite, porque Fastify lo añade a cada `GET`.
- No documenta permisos, cuerpos ni respuestas; es un mapa de qué existe y dónde se declara.
- Si una entrada nueva exige archivos o variables para arrancar, hay que declararla en `ENTRIES`.

Prueba: `tests/api-inventory.test.ts`. Encargo: `CLAUDE-API-INVENTORY`.
