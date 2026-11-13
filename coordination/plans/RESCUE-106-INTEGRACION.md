# RESCUE-106 · Propuesta de integración futura (no ejecutada)

Documento de la sesión autora de CLAUDE-RESCUE-106, 01/11/2026. Describe cómo llevar la Sala de rescate desde la demo aislada al producto. **No se ha integrado nada**: no se tocó App/TeamApp, navegación, APIs existentes, Store, Recovery, esquema común, estilos globales, paquetes ni lockfile. Cada punto requiere su propio encargo con reserva y revisión de Codex.

## 1. Punto de entrada mínimo

Una **ruta secundaria** dentro de Continuidad («Ensayo de caída»), no una pestaña nueva de navegación global. `src/RescueRoom.tsx` se monta lazy desde `ContinuityHome` detrás de un indicador de funcionalidad, con el cliente apuntando a un prefijo `/api/rescue` registrado por un `registerRescueRoom(app, store)` análogo a `registerCopyInspection`. La demo actual se conserva como arnés de revisión.

## 2. Contratos

- `shared/rescue-room.ts`: contexto (`workspaceId`, `accountId`, `captureId`, `captureRevision`), etapas y transiciones, sobres de mutación (`idempotencyKey`, `expectedVersion`, `context`). Estables; versionar con el literal `RESCUE_FORMAT`.
- `shared/rescue-plan.ts` y `shared/rescue-report.ts`: puros; sin red ni disco. Candidatos a revisión independiente por separado.
- `server/rescue-room-journal.ts`: usa `meta` y `transaction` de Store. Convención de claves `rescue:*`; **debe reservarse el prefijo** para que ningún otro módulo escriba ahí.
- Respuesta de mutación: `{ ok, outcome: 'saved'|'uncertain', replayed, version, result }`. Un cliente que no recibe este acuse no puede darla por guardada.

## 3. Cambios en archivos ajenos que exigirían otra reserva (lista exacta)

| Archivo | Cambio | Motivo |
| --- | --- | --- |
| `src/ContinuityHome.tsx` | enlace «Ensayo de caída» + montaje lazy | punto de entrada |
| `server/app.ts` o `server/main.ts` | `registerRescueRoom(...)` | exponer la API en el servidor local, no en el de equipo |
| `server/store.ts` | (opcional) `saveRecord` con transacción reutilizable | hoy abre `BEGIN IMMEDIATE` propio y no se puede anidar; el diario usa un registro de intención en dos fases |
| `server/recovery.ts` | (opcional) `Remote.hasRelation` obligatorio para simuladores | permitiría crear tareas con relaciones en el ensayo |
| `package.json` | script `rescue:demo` | comodidad; no imprescindible |

Ninguno es necesario para seguir usando la demo.

## 4. Datos reales

**No se admiten.** La demo exige una captura con `isTestData: true` y un `Remote` de origen `simulation`; `Recovery` ya rechaza escrituras de producción. Para un portal real habría que diseñar, en un encargo aparte: consentimiento explícito, copia aislada, remoto de **solo lectura** para el ensayo (comparación sin escritura), y un informe que no incluya inventario bruto. El simulador no valida asociaciones ni límites de la API real: no extrapolar sus resultados.

## 5. Aislamiento y permisos

- Servidor propio en loopback, comprobación de `Host`/`Origin`, `Cache-Control: no-store`, CSP restrictiva, cuerpo ≤ 100 KB, JSON estricto.
- Un escritor por carpeta (`lockInstance`); la reanudación solo acepta carpetas con marcador creadas por el lanzador.
- Sin proveedor de IA, sin red externa; el E2E lo bloquea con `scripts/block-external.cjs`.
- La identidad del operador es local: no acredita auditoría multiusuario.

## 6. Migración y vuelta atrás

- Las claves `rescue:*` son aditivas en `meta`; no alteran el esquema SQLite. Migrar = no hacer nada; volver atrás = no montar la ruta (las claves quedan inertes) o borrarlas con una herramienta explícita y reservada (no se propone borrado automático).
- El formato `planb-rescue-room-v1` lleva versión; un cambio incompatible crea `v2` y la lectura de `v1` se bloquea con mensaje, sin reinterpretar.

## 7. Revisión y pruebas previas a integrar

1. Revisión independiente del diario/idempotencia (hay un registro de intención que puede dejar `started` tras una caída: se reanuda con la misma clave).
2. Repetir el E2E con la integración real (rutas de App) en 1440/390/320.
3. Decidir la política de limpieza de carpetas `rescue106-*` en `tests/.tmp` (esta unidad no borra recursivamente).
4. Contrastar contra el motor Recovery vigente: la demo documenta que cambios remotos en campos **no comparados** por el plan no invalidan la revisión (límite del motor, no del ensayo).
