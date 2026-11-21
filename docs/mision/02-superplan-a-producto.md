# Misión maestra · 2. Superplan A: potencia funcional, lógica, arquitectura y diferenciación

21/11/2026. Parte de la auditoría (`01-auditoria.md`). Cada propuesta responde a las preguntas de la misión. Al final de cada una va su **decisión**: entra en 1.0, después o se descarta.

## A0 · Principio rector: un producto, tres preguntas

La frase central del producto ordena todo lo funcional:

> «Aunque mi CRM deje de estar disponible, mi empresa debe saber **qué información conserva**, **qué puede seguir haciendo** y **cómo recuperará la normalidad** de manera controlada.»

| Pregunta | Capacidad | Qué existe | Qué falta para 1.0 |
| --- | --- | --- | --- |
| ¿Qué conservo? | **Copia** | Captura real, programada y cifrada; cobertura por objeto; cronología | Cobertura frente al origen como dato único; aviso de pérdida silenciosa |
| ¿Puedo seguir? | **Prueba** | Simulacro aislado, práctica guiada, modo contingencia | Un único índice de preparación con evidencias; simulacro programado y fechado |
| ¿Cómo vuelvo? | **Vuelta** | Registro de cambios, devolución con conflictos (solo cuentas de prueba), lista manual | Paquete de vuelta para producción revisable por humanos; prueba auténtica en sandbox |

Todo lo que no sirva a una de las tres preguntas o al trabajo diario sobre la copia queda fuera de la 1.0.

**Limpieza previa (A0-L):**

- Montar o retirar del paquete la sala y la cápsula de rescate, `SourceReadingHistory` y `SourceStatusRow`.
- Sacar `server/recovery-rehearsal.ts` del instalable: escribe en la carpeta del código.
- Quitar las Propuestas simuladas del menú.

**Decisión: 1.0 (fase 1).**

## A1 · Índice de preparación único (fusiona Sello, «casi listo» y «Preparación de tu Plan B»)

- **Problema:** hoy la preparación se mide de cuatro formas con números distintos. Un cliente no sabe si está preparado y un auditor no puede fiarse.
- **Para quién:** cualquier pyme usuaria de HubSpot y, sobre todo, la agencia que la supervisa.
- **Qué lo hace valioso:** es la respuesta de una línea a «¿estamos cubiertos?», con evidencia detrás de cada punto. Ningún competidor consultado lo ofrece: venden copias, no preparación.
- **Cómo funciona:** cinco criterios verificables, cada uno con estado (cumple, caduca o falta), su evidencia (fecha y referencia) y una acción.
  1. **Copia reciente:** última captura completa con menos de N horas (N configurable; 24 por defecto).
  2. **Copia íntegra:** recuentos y relaciones conciliados con el origen en la última captura.
  3. **Copia probada:** simulacro superado en los últimos 30 días sobre esa copia o una posterior.
  4. **Copia fuera del equipo:** paquete cifrado exportado con fecha y huella. Es una declaración del usuario más la huella del archivo; Plan B no puede verificar dónde se guarda.
  5. **Acceso protegido:** contraseña local configurada.

  El índice es «Preparado» solo con 5 de 5. El sello mensual pasa a ser el histórico del índice: un mes cuenta como comprobado si todos sus días estuvieron en 5 de 5.
- **Backend:** ninguno nuevo. Se calcula en `shared/` a partir de `/v2/continuity`, capturas, simulacros y exportaciones. Hay que unificar `continuity-insights.ts`, `continuity-seal.ts` y los pasos de preparación en un único `shared/readiness.ts` con pruebas.
- **Complejidad:** baja. Reduce código: tres modelos pasan a uno.
- **Integración:** es el riel de Inicio, la cabecera de Continuidad, el pasaporte y el informe del mes.
- **Prueba:** unitaria por criterio, con fechas límite (justo antes y después de caducar) y con capturas parciales.
- **Comercial:** sí, es la promesa vendible («sabes si estás preparado, y lo puedes demostrar»).

**Decisión: 1.0, fase 3. Es la pieza central.**

**Avance del 21/11/2026.** Ya existía un modelo de cinco pasos (`continuityReadiness`: proteger, conectar, captura, prueba y copia fuera del PC), compartido por la cabecera de Continuidad y el punto del menú. En lugar de crear un tercer modelo:

- Se expone con nombre (`readinessDetailFor`) y es lo que enseña Inicio.
- Inicio ya no repite el sello ni los avisos de prueba y copia externa (`READINESS_ALERTS`).

Diferencia con la propuesta de arriba: hoy el paso 2 es «Conectar y revisar alcance», no «Copia íntegra». Cambiarlo toca el servidor (la conciliación ya existe en `reconciliation`) y queda para el agente del otro ordenador.

## A2 · Integridad de la copia sin pérdidas silenciosas

- **Problema:** una captura parcial o que encoge puede pasar por buena. Ya existe el aviso de encogimiento > 15 %, pero no bloquea nada.
- **Cómo funciona:**
  - Cada captura guarda recuentos por objeto y relaciones esperadas frente a recibidas (ya hay `reconciliation`).
  - Una captura que encoge más de un umbral, o que trae menos relaciones de las declaradas, queda como **«en cuarentena»**: se conserva, pero no sustituye a la copia activa sin confirmación.
- **Backend:** marcar el estado en la captura y una ruta de confirmación. Hay que revisar `server/continuity.ts` y la activación de candidatas, que ya separa candidata y activa.
- **Prueba:** captura simulada que pierde el 20 % de contactos: no se activa sola y lo explica.
- **Comercial:** «Plan B nunca te cambia una buena copia por una mala sin preguntarte».

**Decisión: 1.0, fase 3.**

## A3 · Simulacro programado y con evidencia

- **Existe:** simulacro real en proceso aislado, práctica guiada y calendario de simulacros (C5).
- **Falta:**
  - Que el simulacro se lance **solo**, una vez al mes y con el PC encendido, y que su resultado alimente el criterio 3 de A1.
  - Que el resultado se pueda descargar como evidencia (ya existe el pasaporte, M2).
  - Escenarios de simulacro mínimos y honestos: «sin HubSpot 1 día», «sin HubSpot y con este PC perdido» (restaurar desde el paquete exportado en una carpeta temporal) y «vuelta con conflictos» (sobre datos de prueba).
- **Backend:** el planificador ya hace `tick()` cada 60 s. Se añade el disparo mensual. El escenario «PC perdido» reutiliza `restoreBundle`.
- **Prueba:** reloj inyectado. El simulacro vencido se lanza una vez, no dos (idempotencia) y un fallo deja evidencia de fallo.

**Decisión: 1.0, fase 4. Los escenarios avanzados del Laboratorio quedan fuera.**

## A4 · Paquete de vuelta para producción (devolución revisada sin escritura automática)

- **Problema:** en producción la devolución automática está bloqueada, con razón (`hubspot-remote.ts`, `verify`). Pero el cliente necesita volver a la normalidad y hoy solo tiene una lista imprimible.
- **Qué lo hace diferente:** los competidores restauran **datos antiguos** dentro de HubSpot. Plan B devuelve **el trabajo hecho durante la caída**, con conflictos detectados frente al estado actual de HubSpot.
- **Cómo funciona:**
  1. Al terminar la contingencia, Plan B lee de HubSpot (solo lectura, ya permitido) los registros tocados.
  2. Calcula el conflicto a tres bandas por campo (ya implementado en `recovery.ts`).
  3. La persona decide campo a campo.
  4. Plan B genera un **paquete de vuelta**: CSV por objeto en el formato de importación de HubSpot, con columna de ID y solo los campos decididos, más un informe de lo que se dejó fuera y por qué.
  5. La importación la hace la persona en HubSpot, o la agencia como servicio.
  6. Plan B vuelve a leer y **comprueba** que los valores han llegado (ya existe `/return/check`).
- **Backend:** reutiliza vista previa, decisiones y comprobación. Lo nuevo es el exportador CSV de importación y un estado «devuelto por importación, pendiente de comprobar».
- **Complejidad:** media. Sin escritura en producción, el riesgo es bajo.
- **Prueba:** unitarias del CSV (escape y fechas en el formato que espera HubSpot) y recorrido completo contra una cuenta DEVELOPER_TEST o un sandbox: **la primera evidencia auténtica de devolución del producto**.
- **Comercial:** es la pieza que convierte Plan B en continuidad y no en copia. Además encaja con el servicio profesional de recuperación.

**Decisión: 1.0, fase 4. La escritura automática en producción queda después de 1.0 y necesita aceptación legal y técnica.**

## A5 · Operación durante la caída (el trabajo diario sobre la copia)

- **Existe y es bueno:** Hoy, Agenda, Revisión semanal, fichas con relacionados, actividad, secuencias, edición en línea, en bloque, deshacer, CSV, fusionar y reprogramar.
- **Mejorar, no ampliar:**
  - Una sola definición de «vencido», compartida por Hoy, Agenda, Revisión e Inicio. Hoy la Agenda dice 2 y 23 a la vez.
  - Con el modo contingencia activo, Hoy filtra a lo urgente y Cambios marca todo lo editado como «hecho en contingencia» (ya se cronometra).
  - En la ficha, el resumen y las acciones van arriba; el historial y las secuencias, plegados.
- **Descartar:** nuevas vistas analíticas en el trabajo diario. La analítica vive en Oportunidades › Analítica.

**Decisión: 1.0, fases 3 y 5.**

## A6 · Licencias, planes y puertas en el servidor

- **Problema:** la verificación Ed25519 existe, pero sin clave pública. Las puertas Pro están solo en el cliente y la prueba de 14 días vive en el navegador.
- **Cómo funciona:**
  - Generar el par de claves de venta fuera del repositorio (`scripts/license-tool.mjs keygen`) y fijar la pública.
  - La licencia se guarda en la copia (servidor), no en el navegador.
  - Las rutas de funciones de pago comprueban `planAllows` en el servidor.
  - Sin licencia, todo lo esencial sigue funcionando (principio vigente: nunca se bloquean los datos).
- **Prueba:** licencia válida, caducada, en gracia, de otro emisor y manipulada. Ruta Pro sin licencia → 402 con mensaje claro.
- **Requiere usuario:** custodia de la clave privada.

**Decisión: 1.0, fase 6.**

## A7 · Protección de la clave sin alertas de Defender

- **Problema:** DPAPI vía `powershell.exe` dispara «Suspicious DPAPI Activity». Un cliente con EDR (lo normal en empresas) verá Plan B como amenaza.
- **Opciones:**
  - (a) Binding nativo de DPAPI. Necesita dependencia nativa: el 17/11 se decidió no añadir dependencias.
  - (b) Clave derivada de la contraseña local con scrypt (ya en Node) y sin DPAPI. Pierde la apertura sin contraseña, pero la contraseña ya es un criterio de A1.
  - (c) Almacén de credenciales de Windows mediante un ejecutable firmado propio.
- **Recomendación:** (b) como modo por defecto para empresas, con migración guiada; (a) o (c) más adelante.
- **Prueba:** sin PowerShell en ningún arranque (ya existe la guarda de `NODE_ENV=test`), migración de una copia DPAPI y contraseña olvidada (recuperación solo con el paquete exportado).
- **Requiere usuario:** decisión de producto, porque cambia la experiencia de apertura.

**Decisión: 1.0, fase 2 (decisión) y fase 3 (implementación).**

## A8 · Arquitectura: mejoras justificadas, sin reescribir

| Mejora | Por qué | Cómo se verifica |
| --- | --- | --- |
| ~~Investigar `commitments.test.ts` (espera 401, recibe 200)~~ **Hecho el 21/11** | Era el anclaje de la prueba (la identidad se lee ahora en caché), no una regresión | Prueba reanclada; 8/8; la mutación «sin revalidar» hace fallar las 4 fronteras |
| Un único `shared/overdue.ts` | Cifras contradictorias de vencidos | Misma cifra en Hoy, Agenda, Revisión e Inicio con la misma copia |
| `shared/readiness.ts` (A1) | Tres modelos de preparación | Pruebas por criterio |
| Seguir partiendo `App.tsx` y `ContinuityHome.tsx` | Tamaño y riesgo de cambio | Ningún archivo de interfaz > 25 KB; mismas pruebas en verde |
| Pruebas de comportamiento en lugar de huellas SHA-256 de archivos de interfaz | Hoy impiden mejorar | Sustituir cada huella por una aserción de comportamiento antes de tocar el archivo |
| Rendimiento con 10.000 registros | Límite declarado del piloto | `tools/perf/measure.ts` en CI con presupuesto |
| Copias de la propia App | Si se corrompe la base, ¿qué pasa? | Copia automática de la base antes de cada migración y restauración probada |

**Decisión: fases 1, 2 y 5.**

## A9 · Propuestas evaluadas y descartadas para 1.0

| Propuesta | Por qué no |
| --- | --- |
| Radar de compromisos, Comprobar fecha, Ensayar mi semana | Valor real solo con datos multisistema que el producto no tiene. Quedan como modo demostración |
| Agentes de propuestas | Simulados; competirían con Hoy |
| Google Workspace en local | Depende del servicio de equipo |
| IA con datos reales | Requiere proveedor, contrato y consentimiento; no es la promesa de continuidad |
| Espacio de equipo en la nube | Necesita infraestructura, identidad, RGPD y soporte 24/7: es otra fase de empresa |
| Fuentes Pipedrive y Zendesk | Dispersa el foco antes de dominar HubSpot |
| «¿Cuánto costaría parar?» en la App | Es material de venta: va a la landing y al kit |

## A10 · Propuestas originales (de esta auditoría)

1. **Parte de incidente automático.** Al cerrar el modo contingencia, un documento con duración, qué se hizo en local, qué se devolvió, qué quedó pendiente y quién decidió cada conflicto. Ya hay expediente (`incident-report.ts`); falta unirlo con la vuelta (A4). *1.0, fase 4.*
2. **Cobertura declarada frente a cobertura real.** Lista explícita de lo que Plan B **no** copia (correos, campañas, workflows y adjuntos, según la especificación) en la misma pantalla que la cobertura. Es la honestidad como diferencial. *1.0, fase 3.*
3. **Modo agencia.** Una agencia gestiona varias carpetas de cliente desde un selector local, con el índice de preparación de cada una y sin mezclar datos. Es la base del servicio de preparación. *Después de 1.0*: requiere diseño de permisos.
