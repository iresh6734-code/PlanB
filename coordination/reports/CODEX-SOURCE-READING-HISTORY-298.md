# 298 · Consulta GET del historial local de ensayo

8/11/2026, Europe/Madrid. Presentada para revisión independiente sobre cinco rutas propias. Opt-in no registrado en main/App. No autoaceptación, credenciales, proveedor, SourceStatus working o coberturaA4.

## Comportamiento

`shared/source-reading-history.ts` define query, ámbito del anfitrión, cursor y respuesta. `server/source-reading-history.ts` registra únicamente GET `/api/v7/source-reading-history`, sin HEAD automático o escritor. Primera versión limitada a copia ficticia activa y fuentes/cuentas de ensayo. No hay red en la consulta.

El servidor exige un resolver síncrono local de solo lectura que autorice la instancia/contexto y fuente exacta: proveedor, cuenta, objeto, listing/lookup y objetivo. La query no concede ese permiso; debe coincidir con el ámbito del anfitrión. No hay enumeración general de cuentas ni fallback permisivo. El registro central de consentimientos no está implementado aquí: el binding fijo de las pruebas no lo sustituye.

La autorización original, el pin completo y el ámbito se comprueban antes y después de leer. Un resolver fallido, promesa incompatible o validación que pierde autorización no publica recibos. El cursor liga instancia, contexto, fuente exacta, revisión del ámbito, head del diario y límite; un cambio da conflicto. Es estado de paginación, no una credencial o firma.

Solo se devuelven recibos, hashes, fechas originales, cobertura, causa y recuentos locales. No títulos, etiquetas, referencias externas, relaciones, valores o cuerpos de registros. Una lectura fallida mantiene storedRecords:null. Cero resultados significa ausencia de recibos guardados para ese ámbito, no un proveedor vacío. La respuesta dice storageOnly y «historial local de ensayo»; no se convierte en conectado/observado. Corrupción y fallo de soporte devuelven indisponibilidad, sin reparación o lista vacía inventada. Cabeceras no-store/Pragma/Vary Cookie también en errores.

## Validación propia

Banco fijo final `tests/.tmp/source-history298-G7ud5w`, driver `tests/.tmp/verify-source-history298.cjs`:

- **24/24 nuevas**,7,14s, y **26/26 regresiones**,6,22s: diario297(18) y autorización local(8). Sin omisiones, cancelaciones o reintentos internos.
- Tipos focales exit0. Dependencias con entregas aceptadas cotejadas y todas las fuentes congeladas por hash. No se atribuye una aceptación individual inventada a archivos base sin tarea propia.
- Fastify real con app.inject y Store SQLite ficticia, memoria y archivo con clave de prueba nueva. Se cierra/reabre el servidor de archivo; no es main empaquetado ni prueba de red/puerto de la app instalada.
- GET no inicializa diario, renueva fechas, escribe o purga. CRM/metadatos preservados en los casos positivos. La prueba de fallo inyecta efectos en callbacks para comprobar revalidación; eso no es comportamiento normal del resolver, cuyo contrato exige solo lectura.
- Cuenta/proveedor/objeto/modo/objetivo ajenos se rechazan aunque haya lecturas guardadas. Cursor de otro ámbito, contexto, instancia, límite o head no continúa. Causa/null y ausencia de textos privados se comprueban en la respuesta HTTP.
- Se prueban sesión ausente/caducada sin renovación, pérdida de autorización en callback, getter de ámbito y soporte fallido;401 prevalece sin exponer datos. Se prueban copia inactiva/marcada real, corrupción, resolver nulo/erróneo/asíncrono, métodos de escritura ausentes y caché.

El primer banco `source-history298-SsJG3N` pasó23nuevas+26regresiones pero tipos falló por dos arrays de casos inferidos como uniones con undefined. Se corrigieron las anotaciones, sin debilitar aserciones. En inspección se añadió revalidación tras parsear el binding, incluyendo getter que revoca permiso/lanza; el banco final añade esa regresión. Se conserva el intento inicial y su types.log, no se declara verde.

Cinco mutaciones privadas: permitir que la query conceda otra cuenta, aceptar cursor con head antiguo, ignorar cambio de ámbito, omitir revalidación al validar el binding e ignorar cambio de head antes de publicar. Cada una hace fallar la aserción seleccionada: **5/5 detectadas**, sin presentar los casos no seleccionados como una batería completa. Copia privada restaurada por hash, fuentes raíz intactas. `causal-result.json` y `tests/.tmp/causal-source-history298.cjs` conservados. CIM posterior limitado al banco sin procesos vivos.

## Llegada pendiente y límites

El contrato `SOURCE-READING-HISTORY-298-CONTRACT.md` nombra las unidades sucesoras: registro central/consentimiento por Codex del otro chat; consumidor nuevo de historial por ClaudeB bajo futuro encargo; montaje de Integraciones/App/main por Codex y recorrido real de navegación con QA antes de llamarlo visible. Requiere contratos aceptados y reservas nuevas. Aquí no hay pantalla ni acción de lectura de proveedor. No se tocó el login HubSpot ni terminal16105.

El ámbito es inyectado y confiado al anfitrión. Reenviar filtros del cliente sin autorización allí violaría el contrato; esta función no crea ese registro ni una identidad humana. Solo se permite ensayo, sin promesa de acceso a cuentas reales. La revisión global del diario puede invalidar conservadoramente una página cuando se guarda otra lectura; no se ofrece continuidad entre heads diferentes. No hay prueba de lectores de pantalla, browser o UI porque no se montó una interfaz. No se ha desplegado ni instalado nada.

## Huellas

Las huellas exactas de shared/source-reading-history.ts, server/source-reading-history.ts, test, contrato e informe quedan registradas en submit. El banco conserva las tres fuentes de código/pruebas y sus hashes; los documentos describen las puertas sin atribuir implementación al montaje pendiente.
