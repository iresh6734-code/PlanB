// Gancho de resolución del inventario de la API (CLAUDE-API-INVENTORY), síncrono para module.registerHooks.
// Los módulos de server/ que importan 'fastify' reciben fastify-capture.mjs, que anota las rutas.
// El envoltorio importa el Fastify real resuelto desde server/, así que usa la misma versión que la App.
const SHIM = new URL('./fastify-capture.mjs', import.meta.url).href;
let serverParent = null;

export function resolve(specifier, context, next) {
  if (specifier === 'fastify' && context.parentURL === SHIM) {
    return next(specifier, { ...context, parentURL: serverParent ?? context.parentURL });
  }
  if (specifier === 'fastify' && context.parentURL && /\/server\//.test(context.parentURL)) {
    serverParent ??= context.parentURL;
    return { url: SHIM, shortCircuit: true };
  }
  return next(specifier, context);
}
