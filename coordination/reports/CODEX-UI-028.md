# UI028 · Empresa visible y actualización de interfaz del piloto

29/10/2026, Europe/Madrid. Autor Codex. El usuario pide comprobar Claude, continuar desarrollo y resolver que siempre ve Comercial y no encuentra la empresa ni los avances.

## Resultado

Añadida navegación **Empresa** y una página inicial operativa con los datos que TeamApp ya carga para el espacio activo: contactos, empresas, oportunidades y tareas de la copia local; consulta por tipo y búsqueda; estado de conexión HubSpot, trabajos y conflictos; accesos a Contactos/fichas, Comercial, Agente, Integraciones y Trabajos. No añade peticiones ni crea datos. Los recuentos son de la copia local, no se presentan como una lectura actual del portal.

La página por defecto sin `view` pasa a Empresa; se conservan las rutas explícitas records/jobs/connections/agent/commercial. La salida de Comercial sigue atravesando la guarda existente de borradores. El cambio de espacio remonta el resumen por spaceId y borra selección/búsqueda previas. El piloto sigue ocultando Equipo/Dispositivos y bloqueando sus APIs: esta pantalla no habilita multiusuario o sincronización de dispositivos.

El menú móvil muestra seis accesos en dos filas: en la primera comprobación visual quedaban accesos fuera de pantalla por las reglas existentes de navegación horizontal. Se añadió una clase específica y la prueba exige que todos los botones estén dentro del ancho disponible, además de no desbordar el documento. La tabla mantiene su desplazamiento interno y un nombre accesible.

## Estado de Claude contrastado

La terminal disponible devolvió el final histórico de la corrección de contraste UI010, esperando revisión; no se interpreta como actividad actual de todas las sesiones Claude. Al inicio el tablón y cambios recientes mostraban SEC027 trabajando. Durante esta tarea SEC027 pasó a done, con informe propio y hashes: bloqueo de rutas del piloto, errores 400/413, caducidades, revocación Google, CSV, Sheets y permisos de auditoría. Su informe declara 599/599 y 30 E2E con revisión independiente: **no se repitieron esas baterías completas aquí**.

Codex leyó el informe y repitió `tests/security-hardening.test.ts`: **15/15 correctas**, red externa bloqueada y PGlite aislado. Esto es una comprobación focal, no una nueva auditoría completa. Al cotejar hashes, commercial.ts ya había cambiado por la nueva reserva **CLAUDE-SEC-028**; los otros ocho archivos seguían coincidiendo con SEC027. No se acepta commercial.ts actual contra el hash anterior.

SEC028 reserva servidor y dos componentes para la política de usuarios de solo lectura. Se observaron cambios recientes y estado working, todavía sin informe presentado al cerrar esta comprobación. No se le envió una tarea duplicada, se interrumpió su proceso ni se editaron sus archivos. Sus cambios no se incluyeron en el frontend actualizado.

## Comprobaciones propias

- TypeScript `tsc --noEmit`: correcto al implementar y repetido al final sobre el árbol vigente.
- `tests/ui-journeys.test.ts` + `tests/team-agent-poll-race.test.ts`: **60/60 correctas**, con red externa bloqueada, antes de los cambios posteriores de SEC028 en su test reservado. No se atribuye ese resultado a su nueva versión.
- Nuevo recorrido Playwright `tests/e2e/company-home.spec.ts`: **1/1 correcto** sobre el frontend real con API ficticia interceptada; rutas no previstas fallan y cualquier escritura se rechaza/registra. Comprueba entrada Empresa, cuatro tipos, búsqueda vacía, flechas/foco, cambio de espacio A/B sin datos residuales, Contactos/Trabajos/Comercial, ruta conservada al recargar, y 1440/390/320 px con los seis accesos dentro de pantalla. Cero errores de consola/página, cero tráfico externo y cero escrituras. La compilación final congelada se volvió a probar: 1/1.
- Inspeccionadas capturas escritorio y móvil. Sin solapes/desborde general; la tabla ancha tiene desplazamiento interno. No prueba lector de pantalla ni navegadores distintos de Chromium1228. Browser plugin/skill browser no disponible; se usó Playwright instalado para el contexto sintético separado. El piloto real se comprobó con el conector oficial del navegador integrado mediante cua.getTab, sin ventanas personales o perfiles.
- El primer E2E restringido falló con NETWORK_ACCESS_DENIED y el segundo no alcanzó el servidor del entorno restringido. Se inició el servidor estático de pruebas con autorización de sockets loopback4359 y se repitió allí correctamente. No fueron fallos de producto ni se abrió red a proveedores.

## Compilación consistente y actualización local

No se ejecutó npm run build ni se modificó build/ o dist/ de la raíz. Vite produjo `tests/.tmp/ui028-dist`. Cuando Claude empezó SEC028, se detectó que sus dos componentes podían entrar en una compilación del árbol compartido. Se creó una copia solo de fuentes de frontend/shared/public en `tests/.tmp/ui028-source` y se sustituyeron **solo dentro de esa copia** CommercialWorkspace.tsx y CustomerFiles.tsx por sus versiones HEAD reconstruidas con finales de línea que coincidían exactamente con los hashes `baseline` de SEC028. La fuente compartida de Claude se conservó. Se compiló y probó esa copia final.

Manifiestos locales ignorados por Git: `tests/.tmp/ui028/source-manifest.json` (63 fuentes y hashes) y `tests/.tmp/ui028/deployment.json` (15 activos). La copia de recuperación de la interfaz anterior está en `tests/.tmp/ui028/prior-dist`.

Se copiaron los activos comprobados a `planb-local-google-pilot-2026-10-27/runtime/dist`, conservando los antiguos; index.html se sustituyó al final mediante rename. No se tocó base, configuración, conexiones, tokens, contraseña o servidor; no hubo reinicio. SHA-256:

- index.html anterior: `5cb90264ed519cbac9c73586b360c704b9965a95c8423629c062d583b8e0a33b`.
- index.html nuevo: `bc7ff0c13309a8a0ff1df63e150820813ce98714fa50f70d404b46bf32b257fd`.
- runtime/team.mjs antes/después: `5f89c728938d5a713231cd9364431087d96674f34f70c79cef8157aa70e528c1`, sin cambios.

El navegador integrado cargó `/assets/index-BemWy7Lt.js`, que corresponde a esta compilación. La sesión caducó durante el trabajo; el usuario la desbloqueó personalmente. Codex abrió **Empresa** desde el menú y comprobó 24 contactos, 8 empresas, 12 oportunidades y 18 tareas, sumando los 62 registros locales ya existentes del espacio de ensayo. Abrió la pestaña Empresas y comprobó las ocho filas conservadas; sin crear, editar o enviar datos. Cero errores/avisos capturados. La pantalla queda visible en `http://localhost:4334/team?view=company`.

Evidencias en `C:/Users/iresh/.codex/visualizations/2026/10/29/01a1868d-19af-7341-9ce3-72d23e3a823c/`: `company-home-1440.png`, `company-home-390.png`, `company-home-320.png` son del contexto sintético; **piloto-empresa-actualizada.png** es del piloto real tras el desbloqueo humano y muestra resumen/recuentos, sin bandeja o proveedores. No confundir ambos entornos.

## Límites y siguientes pasos

La interfaz incorpora los arreglos ya aceptados de UX004/005 y las entregas previas; **el backend del piloto sigue siendo anterior a HS022/024 y SEC027/028**. No se afirma que todo el código esté desplegado. SEC028 continúa reservada a Claude; antes de una actualización de servidor hacen falta revisión de su versión final, compilación aislada y ventana de reinicio controlada de esta instalación. No se publica nada externamente.

Persisten H4/recencia global, R08/foco en operaciones y R12/combobox de clientes, la credencial personal HubSpot149623262 y el consentimiento Picker. Empresa es una consulta de copia local, no un editor completo de oportunidades/tareas ni un portado del prototipo workspace-v2. No se activa IA, nube gestionada, multiusuario o autonomía por añadir navegación.

## Aclaración posterior del usuario y revisión de continuidad

El usuario precisa que recuerda más apartados y submenús, no solo un resumen. Revisado src/App.tsx, src/main.tsx y LEEME-v0.6.0: el CRM original conserva Hoy/Continuidad/Trabajar desplegable (Clientes,Empresas,Oportunidades,Tareas)/Cambios/Agentes/Preparación/Exportar, mientras /team carga TeamApp con otro backend. Codex reconoce que el resumen Empresa nuevo no recupera esos módulos. No se declara completada la recuperación/unificación de la interfaz original por esta entrega, ni se añade un enlace roto al root del servidor comercial. Queda como siguiente prioridad concreta, sin crear demos o conectar bases para simularlo.

CONT029 ajena fue leída y cotejada con hashes/estados actuales: conserva HS025 en review, contraste parcial separado de aceptación, restricciones vigentes y archivo íntegro. JSON válido; aceptada por este revisor distinto antes de reservar CONT030 para registrar UI028. No se aceptó HS025 ni su contrato por esta comprobación documental.

## Continuación UI031 solicitada por el usuario

Tras la aclaración, se devolvió esta entrega a working para añadir en TeamApp el enlace CRM completo al CRM4331, con guarda discardOk de borradores. UI031 tiene reserva separada de App/launcher/pruebas e informe. Recuperó el CRM completo con su copia anterior en una carpeta de ejecución nueva y añadió el enlace de retorno Espacio comercial. Dos E2E finales y navegación real en navegador integrado acreditan ida/vuelta y menú original. La recuperación del acceso ya está hecha; las bases y sesiones continúan separadas, sin afirmar fusión de datos. El resumen Empresa se conserva como pantalla del piloto, no como sustituto del CRM.
