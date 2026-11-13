# Traspaso 224 · registrar el ejecutor en el arranque principal (para Codex)

Cambio preciso, **no montado**: archivos de arranque (`server/main.ts`/`v2.ts`) pertenecen a otros.

```ts
const executor = createRelayExecutor({ installRoot: <carpeta de datos de la instancia>, appRoot: <raíz del código desplegado> });
registerRelayRehearsalApi(app, {
  captureAuthorization: security.captureAuthorization,       // la ORIGINAL de createBaseApp; no crear otra
  store: storeRelayRecord(store),
  run: executor.run,                                         // obligatorio: sin él el registro lanza
  timeoutMs: 120_000,
});
```
- Registrar **una vez**, solo en el servidor principal protegido (no en `runtime` ni en `server/team`). El cierre del servidor usa `preClose` (Fastify espera a las peticiones en curso antes de `onClose`; con `onClose` el cierre se colgaba con un ensayo retenido: encontrado y corregido en 216 R2).
- `installRoot`: la carpeta de datos de la instalación (separada de la base activa, de las exportaciones y de las copias); se crea `relay-rehearsals/` dentro. `appRoot`: el directorio que contiene `server/`, `shared/`, `scripts/` (los cuatro del Kit), `package.json` y `node_modules/` con `tsx`. Si el paquete arrancable no los trae, hay que añadirlos al manifiesto de la candidata (o empaquetar el hijo y el destino del Kit con esbuild); es decisión de Codex porque toca `package.json`/scripts de candidata.
- Con `executor.sweep()` al arrancar se limpian las carpetas propias vencidas de un arranque anterior.
- Antes de aceptar: repetir `tests/relay-rehearsal-executor.test.ts` desde la candidata (carpeta sin `tests/`) y añadir el recorrido en la App servida: ensayar → cancelar → comprobar «deteniéndose» → esperar → ensayar.

## R2 (6/11/2026) · lo que cambió en el ejecutor
- **Inventario.** `ProcessTools.findByMarker` ya no devuelve `[]` ante un fallo: RECHAZA si la herramienta falla, se deniega o su salida no termina con la señal de fin (en Windows `INVENTORY_COMPLETE`; `$ErrorActionPreference='Stop'`). `run()` reintenta y **no se asienta** hasta un inventario completo y vacío; mientras tanto `executor.closure()` vale `unverified` y la plaza (RunLease) sigue ocupada. Sin plazo que la libere sin pruebas. Pendiente para 216 (en revisión, no tocado): exponer `closure()` en el estado público (hoy solo se ve como `running`/`stopping` por tiempo agotado).
- **Salida.** Éxito exige línea válida **y** código 0 (o código 1 con `ok:false` informado por el Kit) sin señal; cualquier otra combinación → `child-failed` y carpeta conservada como `partial`. Rechazo del lanzador → `setup-failed` y se retira la carpeta (no hubo ejecución).
- **Raíz.** Se decide por el destino REAL (`realTarget`: ancestro existente resuelto + resto), sin prefijo `\\?\`, sin distinguir mayúsculas en Windows. Rechaza `installRoot` en/bajo `server shared scripts node_modules src dist build tests design coordination` o la propia raíz del código, y `relay-rehearsals` que sea un alias. Antes de escribir, barrer o borrar se revalida (`rootIntact`): una raíz sustituida por unión → `setup-failed`, sin tocar el destino ajeno.
- Retención/cuota: sin cambios (3 parciales, 24 h, 256 MiB total / 64 MiB por ejecución).
- Verificado: 33/33 (ejecutor con Kit real + RunLease + API 216 con Kit real), tipos limpios. Los hijos de las pruebas R2 son sintéticos solo para inyectar errores; el Kit real se ejecuta en las pruebas previas. Resultados de Windows únicamente (POSIX sin ejecutar).

## Unidad pedida a Codex
Registro de relevo y de evidencia de copia en el arranque principal protegido: rutas exactas `server/main.ts` (o el archivo que la registre) y su prueba con `main` compilado y SQLite de archivo; decidir `installRoot`/`appRoot` y el manifiesto de candidata.
