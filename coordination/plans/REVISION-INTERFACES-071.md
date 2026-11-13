# Plan071 · Interfaces completas y contratos revisables

Corte 30/10/26, 17:01:54 Europe/Madrid. La fase anterior produjo mejoras fuente probadas. Falta su revisión independiente y una secuencia parental de acceso. No se declara toda la app aceptada, actualizada o instalada.

## Reparto exacto

- QA060: búsqueda053,exportación054,ensayo050/integración058 yHoy059. Cinco rutas propias;estado ready.
- QA073: siete rutas nuevas para relaciones062/nombre063,historial064,conexión065,activación066,manual067,réplica069 yacceso070. Estado ready, sin reserva. Brief completo coordination/briefs/CLAUDE-QA-073.md (aprox19KB), no enviado por CLI ni leído/acreditado por otra sesión.
- Intersección entre los archivos de QA060 yQA073: cero. Sus fuentes son solo lectura, las unidades Codex conservan reservas durante revisión. Una sesión toma cada encargo; no traspasos por compartir nombreclaude.

## Fuentes presentadas cotejadas ahora

| Unidad | Estado | Rutas reservadas | Informe con evidencia y límites |
|---|---|---:|---|
| CODEX-RELATION-062 | review | 5 | coordination/reports/CODEX-RELATION-062.md |
| CODEX-RELATION-LABEL-063 | review | 2 | coordination/reports/CODEX-RELATION-LABEL-063.md |
| CODEX-HISTORY-064 | review | 7 | coordination/reports/CODEX-HISTORY-064.md |
| CODEX-CONNECTION-065 | review | 5 | coordination/reports/CODEX-CONNECTION-065.md |
| CODEX-ACTIVATION-066 | review | 9 | coordination/reports/CODEX-ACTIVATION-066.md |
| CODEX-MANUAL-067 | review | 5 | coordination/reports/CODEX-MANUAL-067.md |
| CODEX-TEAM-069 | review | 9 | coordination/reports/CODEX-TEAM-069.md |
| CODEX-AUTH-070 | review | 5 | coordination/reports/CODEX-AUTH-070.md |

Todos sus hashes presentados coinciden en este corte; deben volver a comprobarse al iniciar cada auditoría. No se incluyen números de versión inventados ni hashes históricos sustituidos. El tablón contiene los hashes completos, los informes el origen del snapshot; no inferir un build instalado.

## Evidencia propia y riesgo que falta resolver

-062/063: ID fuera de lista, carreras, errores independientes y nombre accesible;15unitarias/3Modal/7E2Efinales. Revisión independiente debe cuestionar proveniencia, handlersviejos y CSS global, no limitarse a repetir fixtures.
-064: historial completo tipado/páginas;10unitarias/3E2Efinales122operaciones/1regresión. No confundir marca histórica con verificaciónremota.
-065:11UI/5E2E,portal/modo/campo/savedack/retry. Proveedor siempre interceptado; no evidencia de HubSpot real.
-066:9API/11UI/7E2E,guardasrevisión. Legacy permanece, diagnóstico inicialUIcorregido:Appyaadaptabacandidata. No volver a convertir props aisladas sin adaptar en fallo del normalApp.
-067:14UI/6E2E,identidadcompleta/mapeo/retry. Rama producción contrafactual porflagUI;backendfixturemarca0/conexiónnull, no prueba remota.
-069:27nuevasNode+1regresión/8E2E,réplicacompleta local yCASv6;old100recortaba345. Equipo interceptado enbrowser;APIrealenmemoria/fetcherfake,legacyv5conservado.
-070:11UI+1regresiónAuth/6E2E,peticiónúnica/acuse/credencial/desmontaje;baseline0/4causal. BackendAuth local real ensetup/login,429yackfalso mocks. Callbackasíncrono soportado, pero padreactual no devuelve su promesa.

No se suman repeticiones como casos distintos. Cada informe separa sensibilidad, caracterizaciones, fallos del arnés y capturas inspeccionadas. QA073 debe aportar oráculos propios y sensibilidad capaz de fallar en servidor y cliente.

## AUTH_PARENT072 · pendiente concreto, no oculto

App.tsx conserva su reserva en SEARCH053. La nueva unidad CODEX-AUTH-PARENT-072 está ready, sinreserva y depende deCODEX-SEARCH-053done para poder tomar ese archivo sin solape. No liberar un archivo con cambios pendientes o autoaceptarSEARCH053para desbloquearlo.

Fallo demostrado ahora en4409confixture nuevo:loginseconfirma,AppsetAuthopen llama voidrefresh(),GETstate503producepageerror y reabreestadoanteriorretenido. Evidenciaauth070/…/parent-observation/observation.json yreproducciónscratchpreservadas eninforme070. No es bypass de autenticación:backendauthenticated:true. DebeaguardarrefreshantesdeabrirApp ydevolverpromesa paraqueProtectionmantengaacuseyretrydone-soloGET. Un GET401 debeconservarbloqueo.

La caracterización1/1 que reproduce el defecto no es un séptimoE2Everde de cierre. QA073 conserva ese pendiente, no lo esconde ni le atribuye arreglo al nuevo componente.

## Puertas de integración

1. Claude reserva su unidad propia, coteja hashes y entrega dictamen por fuente con evidencia ejecutada/estática separada.
2. Codex contrasta el informe sin editar pruebas ajenas. Defecto real vuelve al dueño con nueva presentación; no se aceptan hashes antiguos. Fuentes propias no se autoaceptan.
3. ResolverAUTH_PARENT072cuandoAppquedelibre, másdictámenespendientes delaboratorio/CLI/REL033. Las observacionesR1/O1/O4deQA056 siguen pendientes bajo sus respectivas reservas, no resueltas por este documento.
4. Solo después, candidata formal desde corteaceptado, runtime/artefactos inventariados, pruebas relevantes y revisión integrada. Instalación/despliegue no se realiza enesta fase.

Siguienteacciónindependiente sugerida: convertir la comprobación de copias portátiles en una revisión local visible, reservando nuevas rutas y consumidor libre; inspeccionar primero integración disponible y límites. Es propuesta, no fuente desarrollada ni nueva autorización de proveedor o lectura de bases existentes.

Objetivo continuado activo mientras permitan ejecución/límites; no se conoce cuota restante. Prohibido simular consumo o repetir checks sin nueva causa. Solo checkoutactual/fixturesnuevos, sin equipooriginal, claves/bases reales, proveedores, deps, buildraíz, instalación, commit o push.
