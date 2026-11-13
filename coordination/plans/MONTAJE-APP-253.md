# Montaje de Continuidad (253) · parche de `App.tsx` para su dueño

6/11/2026, Europe/Madrid. **`App.tsx` no se ha editado** (lo integra su dueño por turnos). Lo hecho por esta unidad: `src/ContinuityHome.tsx` ya monta el hub de evidencia y ensayo (217 R2, **en revisión**) con props de navegación **opcionales**; sin el parche el bloque funciona, pero «Abrir Hoy» y «Abrir Integraciones» se explican («ábrelo desde el menú») en lugar de navegar.

## Parche (tres sustituciones, cada ancla única en el `App.tsx` actual)
La fuente única es `APP_PATCH` en `tests/e2e/continuity-home-hub.spec.ts` (la prueba falla si deja de encajar; `tests/continuity-home-hub.test.ts` lo comprueba sin navegador).

1. Tras `const [page, setPage] = useState<…>('continuity');` añadir
```tsx
const [integrationsFrom, setIntegrationsFrom] = useState<'continuity' | null>(null), [returnedFrom, setReturnedFrom] = useState<'integrations' | null>(null);
useEffect(() => { if (page !== 'integrations') setIntegrationsFrom(null); }, [page]);
```
2. En `<ContinuityHome … connectRequest={connectRequest}/>` añadir
```tsx
onOpenToday={()=>{setPage('today');setSelected(null);}}
onOpenIntegrations={()=>{setIntegrationsFrom('continuity');setPage('integrations');setSelected(null);}}
returnedFrom={returnedFrom} onReturnHandled={()=>setReturnedFrom(null)}
```
3. La rama de Integraciones pasa a
```tsx
:page==='integrations'?<>{integrationsFrom?<p className="back-link"><button type="button" className="text-button" onClick={()=>{setIntegrationsFrom(null);setPage('continuity');setSelected(null);setReturnedFrom('integrations');}}>← Volver a Continuidad</button></p>:null}<LocalIntegrations onConnectHubspot={…sin cambios…}/></>
```
Efecto: «Abrir Integraciones» desde el hub lleva al panel existente (218, con su consentimiento, cinco lecturas y caducidad); «← Volver a Continuidad» solo aparece si se llegó desde Continuidad (entrar por el menú no lo muestra); al volver, el hub relee lo guardado (GET), muestra «Has vuelto de Integraciones» y el foco queda en el encabezado del hub. No se pide nada al proveedor.

## Qué hace `ContinuityHome` con las props
`onOpenToday`, `onOpenIntegrations`, `returnedFrom`, `onReturnHandled` son opcionales. `open-preparation` y `open-export` reutilizan `prepare` y `exportCopy` que la portada ya recibe. `connectionKey` sale de `status.connection.accountId`. **No se pasa `context`** ni `installId`: no existe un vínculo autorizado entre la captura de la evidencia y el contexto de `/api/v2/state`, y no se inventa (ver 217 §3).

## Duplicidades revisadas
«Probar mi Plan B» (simulacro aislado de la copia), «Crear copia cifrada» (exportar) y «Configurar conexión HubSpot» (diálogo de conexión) son de la portada y no se repiten en el hub; «Abrir Exportar» del hub lleva a la misma página que «Crear copia cifrada». «Ensayar un relevo» (ficticio) lo aclara un texto del bloque para no confundirse con el simulacro.

## Estado verdadero de las fuentes en `main` hoy
Lectura de HubSpot: registrada (218). Evidencia de copia (`/api/v7/continuity/evidence`): **no registrada en main** → fuente «no se pudo leer» hasta `CODEX-CONTINUITY-EVIDENCE-MOUNT-239`. Ensayo de relevo (`/api/v2/relay/rehearsal`): **no registrado** → idem hasta que Codex registre `createRelayExecutor` + `registerRelayRehearsalApi` (traspaso 224). Siguiente paquete: unidad de registro de servidor (Codex) y, después, tanda 3 (ensayo empaquetado).

## Pendiente para una R3 de 217 (no se edita una entrega presentada)
1. Modo compacto: copia identificada + siguiente paso arriba y detalle plegado (hoy el hub es largo).
2. Distinguir «no disponible en esta versión» (404) de «no se pudo leer» (red/formato) en la tira de fuentes.
3. **Importante antes de ofrecerlo a personas:** con la evidencia de copia sin registrar (404), el pasaporte 214 sigue proponiendo «Preparar o activar una copia local» aunque haya una copia activa (visto en la captura 1440 de la App compilada). Es honesto sobre lo que NO se pudo leer, pero el siguiente paso es engañoso. Salida: registrar 239 antes de exponer el bloque, o que el hub (R3) trate «fuente no registrada» como «no disponible en esta versión» y no genere próximo paso a partir de ella.
4. El título del bloque (`summary` de ContinuityHome) y el `h2` del hub se repiten; el hub necesita una prop `heading`/`headingLevel` o suprimir su `h2`.
