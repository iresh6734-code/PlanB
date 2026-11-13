# Radar291 · Activación explícita desde instalación inicialmente vacía

8/11/2026, Europe/Madrid. Codex. Backend y contrato presentados para revisión independiente; no autoaceptados. Sin cambios en main/App, pantalla, demo4601oZIP.

## Resultado

`mountCommitmentRadar` permite registrar las rutas antes de que exista una copia activa. GETestado solo describe la situación y GETCOREsolo lee; **ninguno crea semilla**. Después de importar y activar una copia ficticia, una acción POSTexplícita con pin exacto inicializa el marcador289. Los reintentos conservan fecha, revisión y decisiones. El escenario no se rejuvenece al reiniciar.

Se resuelve así el hueco dejado explícito en289: una instalación vacía ya no exige generar un dataset nuevo al arrancar o escribir al leer para que el backend pueda registrarse. Queda por conectar el anfitrión de App y sus controles visibles, bajo la unidad central y sus puertasUI/A3.

## Cambios

- `server/commitments.ts`: conserva la API estática con validación/copia al registrar. Añade proveedor interno síncrono de dataset. Cada petición obtiene un corte validado/copiado y una revisión; definición, evidencia, diario, revisión esperada y recibo usan el mismo corte. El proveedor se llama una sola vez por petición, no se relee para calcular claves del diario. Ausente/incompatible/error produce503fijo y revalida antes permiso/pin, incluso en error. No hay callback de red o importación desde HTTP.
- `server/commitment-radar-mount.ts`: composición opt-in, GET `/api/v7/commitment-radar` y POST `/api/v7/commitment-radar/activate`. Usa autorización original y contexto completo del backend, no-store/Pragma/VaryCookie, esquemas estrictos, cuerpo acotado, ficción activa y semilla289. Reloj actual separado de seedAt. No repara o adopta marcadores corruptos/de otra instalación.
- Dos archivos de pruebas nuevos y el contrato `COMMITMENT-RADAR-ACTIVATION-291-CONTRACT.md`. El contrato explica códigos, activación explícita, datos de ensayo, compatibilidad y siguiente montaje. No crea una segunda verdad de proveedor conectado ni cambia coberturaA4.

Antes de editarCORE, el otro chat confirmó su copia de la revisión de UI congelada por hash en radar-ui-independent-Ak1H0b. Sus pruebas no incorporan este cambio accidentalmente. No se editaron las cinco rutas de ClaudeUI, las cuatro de Jornada o su arnés en normalización.

## Evidencia positiva final

Banco fijo **`tests/.tmp/radar291-3KLZM4`**, script `tests/.tmp/verify-radar291.cjs`. Fuentes transitivas y dependencia dinámica del worker copiadas con manifiesto y procedencia de pruebas aceptadas, cotejadas antes/después. Entorno mínimo, ficción/keys de ensayo nuevas y bloqueo de salida externa; Fastifyreal por inject y Store en memoria/archivo.

**55/55 Node**,51,86s, sin omisiones/cancelaciones/reintentos. Tipos focales de los seis archivos de prueba y sus dependencias:0.

| Casos | Cantidad | Qué comprueban |
| --- | --- | --- |
| Nuevos del montaje |12| Vacío, activación explícita, GETsinwrites, marcador único/reintento, pin/queries/body/origen/HEAD, copia de producción, corrupción,401/cache, permisos/contexto en reloj, fallo de escritura y pérdida después de commit, relectura final inválida, archivo/reinicio/historial/evidencia vieja y registro de composición repetido |
| Nuevos de dataset por petición |7| Ausencia/errores sin mensaje privado, una lectura/copia por petición, revisiones/diarios separados, cambio de proveedor durante reloj sin mezclar corte, pin y autorización perdidos incluso en error y compatibilidad estática |
| CORE anterior |8| Concurrencia/reintento, copia, decisiones y cuatro fronteras de autorización |
| Autorización existente245 |8| Sesión, expiración, cierre de Store, validación del guard y captura sin renovación |
| Semilla289 |12| Persistencia, corrupción, producción, rollback, identidad y candado con dos procesos cooperativos |
| Escenario286 |8| Identidades, oráculo, proyección, API, aislamiento y reinicio |

Las pruebas de lectura comparan todas las tablas. Activar o decidir conserva records/changes/captures/archives; únicamente se escriben marcador o eventos del ámbito previsto. El archivo mantiene marcador cifrado y una asignación tras reinicio; al avanzar25h la evidencia es stale y no se generan fechas nuevas. Una sesión perdida después de escribir no recibe metadatos; la escritura confirmada se conserva. Si la relectura final ya no acredita una semilla disponible, no se devuelve201.

No se añadió un escenario a un GETpara conseguir verde. El arranque vacío y la transición posterior ocurren con las rutas ya registradas, no reconstruyendo Fastify tras activar. Los únicos POST del nuevo recurso son activaciones explícitas en las pruebas; no hay envío de tareas.

## Sensibilidad

`tests/.tmp/causal-radar291.cjs` alteró exclusivamente la copia privada y focalizó los casos indicados. Cinco mutaciones, cinco fallos de aserción previstos:

1. No copiar el dataset antes del reloj altera el título/estado de la respuesta y falla la regresión.
2. Releer el proveedor para la clave del diario rompe la lectura única y el corte coherente.
3. Inicializar desde GETstatus escribe y acredita un escenario que todavía no fue habilitado.
4. Omitir la comprobación de autorización después del reloj permite persistir tras revocación.
5. Devolver éxito cuando la relectura final es unavailable produce un201incorrecto.

Cada selección causal deja fuera los casos no seleccionados: no se afirma que sean cinco suites completas. Se restauraron bytes privados y hashes del checkout/manifiesto. causal-result.json registra cinco detecciones yrestoredtrue. CIM limitado a la raíz propia no encontró procesos vivos después del cierre. No hubo navegador.

## Cortes anteriores del mismo desarrollo

`radar291-3aYL70`:46/46 (18nuevos y28regresiones) ytipos0; ampliación en esa copia con8autorización245también8/8ytipos0. En revisión del código se añadió la comprobación final de estado available antes del201 y una regresión específica. El corte final nuevo reúne55casos, incluidas esas ocho y la nueva guardia. No hubo que debilitar o reescribir pruebas aceptadas para hacerlas pasar.

## Huellas

| Archivo | SHA-256 |
| --- | --- |
| server/commitments.ts | 3de235166d2c89488e937bd849fe684be76c1cc8f4823d1e06b32f52891bb70f |
| server/commitment-radar-mount.ts | fbc88df7bcee7db09eaada039aa5e14bcd50e4251bcbe60f5531eb9050c0859e |
| tests/commitment-dataset-source.test.ts | e7ecf8290b2406da565747b78ebc950b7505cf55d166a48896f0d0ed0c5cbbaa |
| tests/commitment-radar-mount.test.ts | 6125e819f1d6d48f4667209e2611ff0219939ffda932454666a447fb8e3ef039 |
| coordination/plans/COMMITMENT-RADAR-ACTIVATION-291-CONTRACT.md | b241988aec9dac07bdeda69f91a2cf5540daa18cffd02b2f81f6308b5da3eed3 |

La sexta huella, este informe, queda en submit. La huella anterior aceptada deCORE `23dc9bd0…` sigue siendo evidencia histórica válida de su corte; este archivo modificado solo puede consumirse como291tras su aceptación.

## Límites y siguiente paso

Sin E2E de App/main esbuild, estado de UI, proveedor real o candidata actualizada. Fastifyinject no acredita instalación servida. Se probó candado cooperativo por la suite289, no procesos que lo ignoren. El proveedor dinámico es síncrono y local; no protege frente a código privilegiado que ignore el contrato. Una revisión nueva del dataset tiene otro diario, no migra decisiones por igualdad deID.

GETstatuspuede describir que falta activar; el anfitrión todavía debe ofrecer la acción humana y esperar su resultado con guardas de contexto. El dueño es `CODEX-COMMITMENT-RADAR-MOUNT`, después de aceptar291y las correcciones deUI/Jornada. El recorrido final será vacío→importar/activar ficción→habilitar→detectar→fuente→decidir→reiniciar→historial. La propuestaA4sigue bajo revisión del otro chat; no se acepta un server-ack por declaración del cliente ni se habilita covers:truepor esta semilla.

ZendeskR3y migracionesR2fueron aceptadas en unidades separadas durante esta entrega; eso no acredita cuentas conectadas ni pantallas. La demo288continúa como instalación aceptada con su recibo aplicado y62datosficticios.
