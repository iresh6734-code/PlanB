# Claude B · De adaptadores aislados a fuentes operativas verificables

10/11/2026, Europe/Madrid. Propuesta de continuidad de Codex coordinador, tablón consultado en revisión2207. Eres Claude B: fuentes, Integraciones, historial y procedencia. Este documento actualiza309. No concede por sí mismo nuevas reservas ni acceso a cuentas. Conserva tus reservas actuales y registra cada ampliación antes de escribir.

## Resultado que queremos

Una persona entra en Integraciones y entiende qué cuenta está configurada, qué se pudo observar, cuándo, con qué cobertura y qué puede hacer ahora. Ejecuta una lectura de ensayo explícita, encuentra su recibo tras reiniciar y sigue la evidencia hasta un compromiso del Radar. Cuando falte información, la aplicación debe identificar la carencia y la siguiente comprobación útil.

La primera entrega completa usa ficción y servidores controlados. Eso ya debe ser funcional y persistente dentro de la App. Un proveedor real es una validación posterior sobre cuenta y alcance autorizados; no se simula su conexión mediante colores o botones.

## Estado comprobado

- SourceStatus R3, Pipedrive R3, Zendesk, diario297, API298 e HISTORY-UI R2 están aceptados. No los rehagas ni crees otro historial equivalente.
- Tu `CLAUDE-SOURCE-STATUS-ROW` está working por la devolución312. Son seis rutas reservadas; no consta R2 presentada.
- El historial todavía no está montado en Integraciones. `CLAUDE-SOURCE-HISTORY-MOUNT-QA` sigue ready y su ejecución de producto necesita el montaje, aunque el componente ya sea done.
- Registro de fuentes, GET de estado derivado y lectura explícita de ensayo son piezas pendientes. El acuerdo previo asignaba su backend al coordinador; aquí proponemos transferirte su implementación en módulos nuevos para eliminar esa espera. **La transferencia requiere nueva tarea y confirmación en tablón antes del claim.** Codex conserva contratos/revisión y el registro en main/App.
-308 sigue review; no adoptes sus bytes como baseline aceptado. A4 depende de316/318. Tras319,316 está working para corregir sus códigos503 y el inventario de cuarentena208; no es un backend aceptado. Radar depende de su montaje. No anuncies el puente o la navegación como existentes.

Relee los estados antes de cada unidad. No confundas317, el guion histórico de A4, con una QA verde. Tampoco confundas aceptación de un componente con actualización de la demo.

## Paquete B0 · Corregir SourceStatusRow sin ampliar la superficie

Lee `coordination/reviews/CLAUDE-SOURCE-STATUS-ROW-independent-312.md`. La firma parcial omite `authorizedAt`: renovar autorización de la misma cuenta conserva el botón ocupado, los detalles abiertos y una terminación anterior en la vista nueva.

Invalida actividad y detalles ante cambios semánticos de la vista validada. La representación normalizada completa evita mantener una lista incompleta de campos. Define en el traspaso cómo el anfitrión desmontará/reidentificará la fila al cambiar instalación, captura, generación, pin o fuente exacta, incluso si los textos visibles coinciden. No basta una clave de título o proveedor.

Repite las tres sondas del revisor intactas, tus cinco pruebas DOM y tres SSR, distinguiendo sus alcances. Incluye autorización renovada, cambio de objeto/cobertura conservando fecha y respuesta tardía. No dupliques la derivación de SourceStatus ni añadas fetch a una fila pura. Presenta R2 y deja esas seis rutas intactas durante review.

## Paquete B1 · Registro local de fuentes y contrato de lectura

Mientras se revisa B0, propone a Codex una tarea nueva de backend en rutas como `shared/source-registry.ts`, `server/source-registry.ts`, `tests/source-registry.test.ts` y contrato/informe propios. Son nombres propuestos; la reserva efectiva se comprueba al registrar y reclamar. No edites Store, security, main, runtime ni los modelos aceptados de fuentes.

Acuerda el contrato antes del código definitivo. Reutiliza `SourceRegistryEntry`, SourceReading y diario297. Define versión, ID local estable, proveedor/cuenta/objeto/modo/objetivo, identidad completa de la copia, revisión del registro, procedencia y alcance autorizado. El servidor resuelve ese ámbito independientemente del cliente. Preparar configuración no acredita identidad observada o lectura del proveedor.

Persiste en un espacio de metadatos propio, sellado por Store. Las decisiones de configuración usan revisión esperada y una clave estable de operación; el cambio y su evento se conservan juntos. Un replay no duplica configuración o consentimiento. Una revisión antigua conserva lo escrito en la interfaz. Identificadores iguales entre proveedores/cuentas permanecen separados.

Los GET no inicializan, renuevan fechas, reparan ni escriben. Configuración ausente, registro ilegible, lectura fallida y lista vacía son estados distintos. Una fila corrupta se conserva con un diagnóstico acotado; no devuelve cero por defecto. No almacenes tokens, cookies o secretos en este contrato público, recibos o fixtures. La gestión de credenciales existente tiene otro alcance.

Prueba archivo real, reapertura, cuenta vacía/null cuando corresponda, contexto nuevo, CAS, replay, corrupción y cuota. Evita sobreescribir una marca dudosa tras un fallo de COMMIT. Coordina el esquema de errores con Codex; no inventes que un error genérico acredita ausencia de efecto.

## Paquete B2 · Estado derivado y lectura explícita de ensayo

Con el registro aceptado, acuerda la API en rutas nuevas propuestas `server/source-registry-api.ts`, contrato compartido propio y pruebas. El registrador es opt-in en una base protegida; Codex hará su montaje en los entrypoints. No publiques una ruta distinta solo para evitar un archivo reservado.

El GET sirve `SourceStatusView` derivada en servidor con el contrato aceptado. No envía textos de registros o SourceReading completa para dibujar una fila. Apertura y Actualizar consultan solo lo local. La identidad de cuenta observada y el estado de acceso corresponden a hechos de una lectura, no al almacenamiento de un secreto.

La acción de ensayo requiere confirmación de fuente, cuenta, objetos y naturaleza ficticia. Reutiliza los adaptadores aceptados contra un origen controlado por el arnés. El producto no acepta una URL arbitraria del navegador como permiso de red. Separa solicitud, intento del transporte, páginas utilizables y recibo persistido. Si hay efecto pero se pierde el acuse, consultar es seguro y repetir automáticamente no lo es.

Preserva paginación, presupuestos, fechas originales, parcialidad y causas. Un fallo después de una página no convierte esa página en cobertura completa. Una lectura vieja guardada ahora sigue vieja. Un listado vacío completo solo acredita el listado observado. Interrupción no permite afirmar que el proveedor no respondió.

El recibo297 y su revisión son la fuente del historial298. No mantengas un contador paralelo en React ni otro diario. Si hay un hueco entre recibir datos y persistir, decláralo y prueba su recuperación; no inventes un recibo que no se conservó. Las guardias de sesión original/contexto se revalidan tras esperas y antes de publicar o guardar resultados.

## Paquete B3 · Montaje visible y QA de Integraciones

Prepara un contenedor propio propuesto `src/IntegrationSources.tsx`, cliente/estilos y sus pruebas. Consume API aceptada y compone `SourceStatusRow` con `SourceReadingHistory` bajo detalles plegados. El historial se consulta al abrirlo, no por montar todos los hijos ocultos. Propaga contexto completo y una clave que invalide respuestas de otra copia/cuenta.

Mantén una primera lectura sencilla: herramienta, cuenta, qué se sabe, cuándo y siguiente acción. Los detalles técnicos no ocupan el recorrido habitual. Un botón existe si ejecuta una acción real del producto. Reintentar una lectura local no debe invocar un proveedor. La finalización del handler no pinta «Conectado» por su cuenta.

Codex mantiene `App.tsx`, `LocalIntegrations.tsx`, main y runtime para esta propuesta, salvo transferencia posterior explícita. Entrega un cambio mínimo de montaje con props exactas; el coordinador lo registra en su propia unidad. Después ejecuta tu `CLAUDE-SOURCE-HISTORY-MOUNT-QA` sobre la App compilada aceptada, no únicamente sobre otro arnés.

Guion de salida: entrar en Integraciones → distinguir estado inicial → confirmar ensayo → recibir evidencia y recibo → abrir historial paginado → reiniciar → conservarlos → cambiar de copia/bloquear → retirar datos anteriores. Debe pasar a1440/390/320, con teclado/foco y capturas inspeccionadas. Registra APIs usadas, solicitudes externas observadas, efecto persistido, binario y activos servidos. No uses una captura de componente para cerrar la prueba de App.

## Paquete B4 · Evidencia que explica el riesgo y la siguiente comprobación

Este será tu salto de producto cuando fuentes estén visibles. Propón un único puente de observaciones al Radar, con Codex dueño del contrato de compromisos y Claude A dueño de su ficha. Reutiliza referencias explícitas y decisiones humanas existentes; no relaciones por título, importe o coincidencia de ID.

Entrega tres capacidades conectadas:

- **Por qué aparece este riesgo:** cada causa enlaza a proveedor, cuenta, objeto, ID, observación, cobertura y lectura que la sostiene. La UI de Claude A consume ese contrato, sin duplicar el motor de fuentes.
- **Qué falta comprobar:** una salida determinista que diga qué relación, dato o lectura permitiría resolver una conclusión incierta. No necesita IA ni llamadas externas automáticas. Explica también cuándo una nueva lectura no resolvería la ambigüedad y hace falta decisión humana.
- **Qué cambió desde la lectura anterior:** comparación dentro del mismo ámbito y objeto, con distinción de cambio observado, ausencia confirmable y ausencia no demostrable por cobertura parcial. Acuerda primero un contrato propio; el historial de recibos actual no contiene todos los datos necesarios y no se amplía de forma implícita.

El caso de aceptación combina venta, pedido ficticio y ticket; un ID de otra cuenta no se vincula. Caída, lectura antigua y paginación parcial degradan la conclusión sin cerrar el compromiso. El informe y la película del incidente identifican exactamente qué lectura se usó. Generar ese análisis solo lee; convertir una propuesta en decisión exige revisión y confirmación del operador.

## Paquete B5 · Piloto real y extensiones con puerta propia

Cuando el recorrido local esté integrado, prepara la comprobación con cuenta propia. Revisa primero las autorizaciones y recibos ya existentes; no vuelvas a pedir lo que esté concedido, ni amplíes cinco GET a sincronización, esquemas o escrituras. La última identidad comunicada del portal personal es149623262, pero sesión web, tipo de cuenta, credencial API y una comprobación reciente son hechos diferentes. No reutilices una sesión histórica como autorización nueva.

La credencial la introduce la persona en la superficie protegida correspondiente; no la extraigas de perfiles ni la pegues en chat/informes. Si hace falta login interactivo, usa solo un navegador disponible de este equipo y devuelve el control a la persona. No prometas controlar ventanas o sesiones de otro agente sin herramientas y permisos comprobados. Una prueba de solo lectura no habilita producción o escritura por analogía.

Después del piloto, Pipedrive y Zendesk permiten validar el mismo modelo fuera de HubSpot con su cuenta/alcance propios. Shopify y migraciones conservan sus puertas del plan general. No abras una tercera línea mientras Integraciones e historial sigan sin montar. El verificador de migraciones se activa en Fase4; no alteres el comparador de capturas existente para fingir compatibilidad entre cuentas.

## Orden y Definition of Done

B0 primero. B1 puede prepararse en paralelo y comienza a implementar solo tras registrar su transferencia y contrato. B2 consume B1 aceptado; B3 se prepara mientras se revisa el backend y se verifica en candidata después del montaje. B4 aporta fixture y contrato mientras se revisa la candidata, y después se integra. B5 espera su alcance real.

Por cada capacidad deja entrada visible, API, efecto, evidencia, dueño y estado implementado/aceptado/montado/verificado con proveedor. No te autoaceptes. Conserva raíces, bases y puertos propios; coordina Chromium. No toques ficha, gestor, SCENARIOS, LAB036, contexto035 o archivos centrales ajenos. La ambición consiste en completar el recorrido de fuentes hasta la decisión, con evidencia que una persona pueda entender.
