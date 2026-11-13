# CODEX-APP-CYCLE-126 · Desde copia vacía hasta trabajo persistente

2/11/2026, Europe/Madrid. Presentada para revisión, sin autoaceptación. Dos pruebas nuevas de navegador cubren el ciclo que no demostraban las fixtures ya importadas/activadas de117/120. No se editó código de la App o de Claude.

## Resultado observado

**Agencia Norte:** se inicia una instalación vacía, se importa el conjunto mediante la UI y Hoy muestra14 tareas antes de generar o activar. Se vuelve a Procesos, se genera la especificación de ensayo y la activación exige marcar la revisión. Una vez activa, se desconectan los servicios, se edita el teléfono ficticio de contact-1, se comprueba su valor en tabla/API y se descarga un CSV con el cambio. Se cierra la página, se detiene exclusivamente ese proceso y se inicia otro sobre la misma base. La identidad de instancia se conserva, el PID cambia, los62 registros conservan su digest y sigue pendiente el único cambio local. El campo editado y Hoy vuelven a verse.

**Distribuidora Atlas:** otra instalación vacía se prepara/activa por la UI con el segundo perfil. Aparece Código de cliente y desaparece Servicio contratado. Al intentar pasar una oportunidad a En entrega sin referencia se muestra la validación, aria-invalid=true y el digest de todos los registros permanece igual. Se rellena la referencia, se guarda y la API confirma ENSAYO-126 en el campo reference de deal-1. Hoy muestra14 tareas con esta configuración.

No se usó IA, HubSpot, Google ni una copia real. El modo de ensayo de generación conserva reglas importadas; no se presenta como interpretación de un modelo.

## Entorno y evidencia

- Backend principal real compilado de server/main.ts y14 artefactos Vite ya verificados en el corte117/120, iguales porSHA-256 a PREVIEW125. Se comprobaron antes de copiar. No se recompiló una variante de la App para hacer pasar estos casos.
- Carpeta final nueva: `tests/.tmp/cycle126-11bdd997-6cbe-430a-8130-46fa6f3e5770`. Cada test crea runtime/base/key nuevos; no copia base, semilla, clave o ajustes del preview. El primer estado comprueba snapshot:null/ready:false.
- Puertos propios4592/4593. Tres PIDs finales:33332→32736 para la misma instancia `5ec35fa1-12ef-4bf5-9bd3-d0fd63790164`;28628 para `a8dab59d-0cb2-4f8d-b17e-881e9d2d692f`. Los tres registraron salida y ya no existían al cotejo posterior. No se detuvo4591/4451 ni otro servicio.
- Store persiste en SQLite real en disco. Claves nuevas kind:test precreadas antes de abrir Store, NODE_ENV=test y entorno de sistema por allowlist. No DPAPI o claves anteriores en estas nuevas fixtures; no protección comercial para datos reales. Se preservan las carpetas/evidencias sin borrado recursivo.
- Browser plugin not available; CLI Playwright del repositorio, Chromium headless1228 existente, perfiles nuevos. Página bloquea cualquier otro origen y el backend usa block-external.cjs. No instalación de dependencias.

`results.json`, `browser.log`, `inputs.json` y las dos subcarpetas copy-* conservan manifests de artefactos, logs porPID, owner/exit, observed.json, CSV y capturas. Los valores de las claves no aparecen en informes o salidas. Los datos/contactos son los conjuntos ficticios recién generados.

## Comprobaciones

| Capa | Resultado |
| --- | --- |
|Dos E2E finales nuevos |2/2,0fallos/skip/flaky |
|Typecheck focal final |Limpio sobre test y harness con sus imports |
|Identidad de página |Título Plan B y encabezados de preparación/clientes/Hoy/perfil correctos |
|Contenido/overlay |UI significativa en las fases; sin overlay observado en las capturas |
|Consola/JS/red |0pageerror,0warnings/errorsconsola,0peticiones externas en el corte final |
|Persistencia |Cambio del teléfono,62registros y su digest,changes:1,disconnected:true e identidad conservados tras proceso nuevo |
|Regla de Distribution |Intento inválido no cambia registros; corrección válida se guarda por PATCH |
|Visual |Capturas finales desktop de Hoy tras reinicio y Distribution inspeccionadas; no nueva auditoría móvil |

Digest lógico de registros Agencia tras la edición y tras reabrir: `f80e1c2904a4f7a3e83827eec69d7d249e26db05edcb916caba1e439c69ed584`. Es igualdad de esa ficción ensayada, no un certificado de recuperación general.

Escrituras de Agencia observadas: POST import/fixture, generate, v4/activate-reviewed, disconnect y PATCH contacts/contact-1. Distribution: import/fixture, generate, v4/activate-reviewed y PATCH deals/deal-1. El rechazo de regla se detecta en el editor antes de escribir; no requiere un PATCH fallido para ser válido. No hubo escrituras a conectores o proveedores.

Hashes finales: test `964aeef316bdf24979d6ddc994f62c3fe2a2451607d6fbfe147e20afa021d665`; harness `42d2117ff09ff8de36c5d9432dbe2c8762d884f8e0206732019cd43a21d482b5`. Typecheck en `tests/.tmp/cycle126-types-f31313fa-053c-425f-92f9-d45b63b47283/typecheck-final.log`, con los mismos hashes actuales.

## Incidencias del arnés conservadas

Primer pase1/2: Agencia completó el ciclo; Distribution llegó a la validación y luego el selector exacto por etiqueta dejó de coincidir porque el texto de error pasa a formar parte del nombre accesible. Se cambió a la identidad estable del mismo campo, manteniendo las comprobaciones de nombre inicial, alerta, aria-invalid y datos intactos. También se corrigió la expectativa del nombre del campo almacenado a reference (contrato existente). Ningún cambio de producto.

Segundo pase1/2: Distribution completa; Agencia conservó sus datos, pero el test exigía consola vacía mientras apagaba deliberadamente el servidor con la pantalla Cambios aún sondeando. Se registró ERR_CONNECTION_REFUSED. El test final realiza un cierre/reapertura limpio: navega a about:blank antes de detener el proceso y vuelve a abrir después de confirmar el nuevo endpoint. Mantiene las aserciones de persistencia y consola, sin ignorar errores. Esto prueba cerrar y reabrir, no comportamiento de una pestaña mantenida abierta durante una caída del servicio local. El pase final es2/2. Los tres cortes permanecen separados; no se suman como seis pruebas nuevas.

## Límites y siguiente paso

No se prueba recuperación desde una copia portable/ZIP, un apagado físico, fallo de disco, concurrencia multiproceso o cambio de datos simultáneo. La edición actual sigue el contrato existente; la revisión condicional propuesta en128 se evaluará por separado. La descargaCSV preserva el valor cambiado; no se declara validada aquí la exportación del runtime completo, para la que faltan los demás bundles en esta fixture.

117/120 fueron aceptadas por el otro Codex mediante127;053 permanece enreview porque contiene la búsqueda y más rutas históricas.126 no las autoacepta ni extiende ese dictamen. Claude116/123 conserva sus reservas. El otro chat prepara128 en archivos nuevos; no se montó su API ni se editaron App/Store para esta comprobación.

Estos dos recorridos complementan132Node/11DOM anteriores; no convierten la suite global en verde ni prueban proveedores reales. Siguiente: revisión independiente de126 y continuar el montaje de tareas/CAS solo tras contratos presentados y reservas explícitas.4591 conserva el preview anterior; no se recreó o actualizó desde estas bases.
