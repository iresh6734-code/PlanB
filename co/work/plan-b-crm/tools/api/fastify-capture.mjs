// Envoltorio de Fastify para el inventario de la API (CLAUDE-API-INVENTORY).
// Anota cada ruta con el archivo y la línea de server/ que la declara. Al llamar a listen escribe la lista en
// PLANB_API_CAPTURE_OUT y termina el proceso: nunca abre un puerto ni llega a publicar el archivo de descubrimiento.
import { writeFileSync } from 'node:fs';
import real from 'fastify';
export * from 'fastify';

const out = process.env.PLANB_API_CAPTURE_OUT;
if (!out) throw new Error('fastify-capture solo se usa desde tools/api/inventory.mjs (falta PLANB_API_CAPTURE_OUT).');
const routes = [];

/** Primer marco de la pila que pertenece a server/ (fuera de node_modules y de este archivo). */
function origin() {
  for (const frame of (new Error().stack ?? '').split('\n').slice(1)) {
    const match = /(?:file:\/\/\/?)?([A-Za-z]:[\\/][^:)]+|\/[^:)]+):(\d+):\d+/.exec(frame);
    if (!match) continue;
    const file = match[1].replace(/\\/g, '/');
    if (file.includes('/node_modules/') || file.endsWith('/fastify-capture.mjs')) continue;
    const at = file.lastIndexOf('/server/');
    if (at >= 0) return { file: file.slice(at + 1), line: Number(match[2]) };
  }
  return { file: null, line: null };
}

export default function capture(options) {
  const app = real(options);
  app.addHook('onRoute', route => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    const { file, line } = origin();
    // HEAD lo añade Fastify automáticamente a cada GET; no es una ruta declarada.
    for (const method of methods) if (method !== 'HEAD') routes.push({ method, url: route.url, file, line });
  });
  app.listen = async () => {
    await app.ready();
    // `listening` permite al inventario comprobar que de verdad no se abrió ningún puerto.
    writeFileSync(out, JSON.stringify({ routes, listening: app.server.listening }));
    process.exit(0);
  };
  return app;
}
