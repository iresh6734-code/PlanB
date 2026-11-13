# Claude B · Fuentes utilizables, procedencia visible y verificación de migraciones

Encargo sucesor actualizado el 8/11/2026, Europe/Madrid. Sustituye la versión anterior de este mismo prompt. Sesión responsable: Claude B, fuentes, evidencia y portabilidad. Queremos una tanda extensa de implementación que acerque las integraciones a la App. Las pruebas sintéticas y los módulos internos deben seguir identificados como tales.

## 1. Arranca con los estados correctos

- `CLAUDE-SOURCE-ZENDESK` R3 está done, aceptada tras 29 pruebas del autor y 12 sondas independientes. No hay lectura real de Zendesk ni montaje.
- `CLAUDE-SOURCE-PIPEDRIVE` está en review, cuatro rutas; tu informe declara 14/14, 18 mutantes y límites documentales. No está aceptada y no se toca después de submit.
- `CLAUDE-MIGRATION-VERIFIER-CORE` R2 está done, contrastada con 24 pruebas del autor y siete sondas independientes. Sigue siendo motor interno.
- **Actualización importante: `CLAUDE-MIGRATION-VERIFIER-VISUAL` ha sido devuelta a working por 294.** Conserva sus seis reservas. El caso de controles Unicode crea IDs visualmente indistinguibles; atiéndelo primero según el brief específico.
- `CLAUDE-SOURCE-INTEGRATIONS-CONTRACT` está working, tres rutas. Termina ese contrato y su derivación antes de crear otro modelo de estado.
- `CLAUDE-WORK-SUMMARY-QA` está en review. Sus hallazgos de semántica y botón sin destino siguen pendientes de decisiones de producto; una QA presentada no los corrige.
- La demo vigente 288 en `http://127.0.0.1:4601/` ya muestra el resumen de trabajo, sin cobertura y con recuentos nulos. A4 no está instrumentada. El lector no puede acreditar al escritor.
- Escenario multisistema, semilla 289 y backend de activación 291 están aceptados. Radar UI y Jornada están en review R2; el Radar todavía no tiene montaje en App.

Relee tablón, dictámenes y contexto. El número aislado no identifica una tarea: usa el ID completo. Lee AGENTS.md y COORDINACION.md; registra responsable de sesión, rutas exactas, dependencias y criterios, claim y check-path antes de editar. No tomes archivos en review aunque pertenezcan al actor claude de otra sesión.

## 2. Prioridad inmediata · R2 visual de migraciones

Lee `coordination/briefs/CLAUDE-MIGRATION-VISUAL-R2-294.md` y el dictamen 294. La revisión repitió 31 Node y tres Chromium; encontró después un fallo independiente de representación. Esas suites verdes no cierran el defecto.

El ID que contiene el carácter real U+202E y el ID que contiene literalmente la notación ‹U+202E› aparecen iguales en el HTML. Corrige la representación para que ambos sean distinguibles, sin alterar JSON, huellas, emparejamiento ni datos originales. Conserva neutralización de controles y dirección y escape de HTML. Considera el texto que ya contiene la nueva notación, sus delimitadores y otras notaciones de controles: no traslades la colisión a otro carácter.

Reproduce en Node y en el texto visible del DOM con dos IDs distintos. La aserción debe fallar con el informe anterior en copia privada y pasar con el corregido. Conserva las 24 CORE y las aserciones visuales; repite las pruebas focales afectadas y los tres recorridos de HTML. Presenta R2 con hashes y deja de editar. No amplíes esa reserva a un Worker, pantalla o endpoint.

Si Pipedrive se devuelve durante esta fase, atiende su dictamen bajo sus cuatro rutas; una dependencia aceptada no concede permiso de editar el transporte común. Cualquier cambio compartido exige unidad nueva.

## 3. Paquete de producto · Estado de fuentes que se pueda entender

Termina `CLAUDE-SOURCE-INTEGRATIONS-CONTRACT` usando SourceReading. La derivación debe mantener separados: implementación preparada, lectura de ensayo, lectura realmente observada; cuenta configurada frente a identidad de cuenta comprobada; objetos leídos, parciales y no disponibles. La existencia de una credencial no demuestra una conexión ni acceso actual.

Define una siguiente acción que el producto pueda cumplir. Si faltan cuenta o autorización, muestra lo necesario; no dibujes un botón Conectar que cambie una etiqueta. Una lectura fallida no se transforma en cero registros. No expongas cuerpos de tickets, credenciales, cabeceras ni mensajes arbitrarios del proveedor en el resumen.

Presenta esquema, derivación, pruebas y propuesta de montaje. Después de su aceptación, registra un consumidor visual independiente con sus propios componente/CSS/cliente/pruebas. Acuerda sus nombres y props con el coordinador antes de reservar; no empieces editando LocalIntegrations, App o main.

El consumidor debe poder mostrar de forma compacta:

1. Qué herramienta y cuenta representa cada fila.
2. Qué objeto se comprobó y en qué instante.
3. Cuánta cobertura se obtuvo y por qué se detuvo la lectura.
4. De dónde procede ese resultado y si es una fixture.
5. Qué puede hacer ahora la persona, con una acción real o una condición explícita.

Puede construirse mientras el montaje central espera, pero se entrega como componente preparado hasta verificar su entrada desde Integraciones. Codex acuerda y reserva persistencia/API/montaje central; no consumas una ruta propuesta como si ya existiera. No crees un endpoint de éxito fijo para cerrar la UI.

## 4. Paquete de fuentes · Del adaptador a una evidencia reutilizable

Cuando Pipedrive esté aceptada, acuerda una unidad para el puente de lecturas aceptadas al Radar. Reutiliza contratos existentes; no equipares IDs entre proveedores, cuentas o tipos de objeto. Las personas, organizaciones y actividades de Pipedrive son contexto sin rol; no se proyectan automáticamente como compromisos.

La primera entrega puede usar lecturas ficticias explícitas producidas por los adaptadores, no resultados exitosos escritos a mano. Conserva identidad y cobertura de origen en toda la proyección. Vincula solo por referencia explícita o una decisión humana que el contrato permita. Nombres iguales y referencias incompletas quedan como candidatos.

Propón el contrato del puente y su encargo de montaje al dueño de compromisos antes de cambiarlo. El ensayo debe demostrar que el mismo patrón de compromiso funciona con HubSpot y Pipedrive y que soporte Zendesk añade su propia evidencia. Pedido fixture sigue siendo fixture; no lo presentes como Shopify conectado.

Prueba página interrumpida, acceso perdido después de la primera página, cursor repetido, objeto desconocido, mismo ID en dos cuentas y cuenta configurada que no coincide con la observada. No deduzcas «completo» por recibir una página vacía sin señal de fin válida. No añadas refrescos externos en el GET que abre Integraciones o Hoy.

No amplíes a Shopify, otro CRM o escrituras antes de cerrar este puente y su utilidad visible. La creatividad debe aprovechar el motor compartido, no multiplicar adaptadores aislados.

## 5. Paquete de coherencia · Resumen, pasaporte y navegación

Tus dos hallazgos de QA deben convertirse en correcciones con dueño:

- Pasaporte/mapa no deben decir «No se pudo leer» si lo conocido es que falta cobertura de productores. Distingue ausencia de cobertura, fallo de lectura y trabajo vacío.
- «Abrir Trabajo por recuperar» necesita un destino real. Mientras A4 no esté disponible, acuerda retirarlo o sustituirlo por una explicación útil; no lo presentes como navegación funcional.

Registra la unidad sucesora solo cuando se acuerden rutas y responsable; los archivos centrales siguen coordinados por Codex. Conserva una sola lectura del resumen para tarjeta, pasaporte y mapa, con el mismo pin. No crees un segundo fetch independiente para arreglar un texto.

Valida cambio de captura, bloqueo y sesión nueva, respuesta vieja con transporte que ignora AbortSignal, error parcial y descarga. Recuentos nulos significan desconocidos. Los fixtures con cobertura verdadera prueban el consumidor y no autorizan covers=true en el producto. La cobertura real de A4 requiere el protocolo del escritor y un ámbito explícito.

## 6. Paquete multisistema · Probar valor en la candidata

Cuando el montaje del Radar esté aceptado, añade una unidad de pruebas de App con archivos propios, sin tomar el spec del autor ni sus reservas. Usa el oráculo del escenario multisistema y la semilla estable 289.

Desde la navegación habitual: detectar instalación bloqueada → explicar pedido y ticket → asignar siguiente paso → reiniciar → encontrar el mismo historial. Repite con el caso sano, uno parcial y otro sin acceso. Un registro de otra cuenta con el mismo ID actúa como control y no hereda ni vínculo ni decisión.

Comprueba binario y activos servidos, no solo fuentes del checkout. 291 permite habilitación explícita sin GET mutante; no recrees un dataset con Date.now por cada arranque para que el test pase. Si la candidata aún espera Fase 0, prepara fixture y aserciones propias como trabajo interno y registra el bloqueo. No declares demostrado el recorrido.

## 7. Línea de migraciones · Preparar una función potente sin adelantar su fase

Después de VISUAL done, acuerda con Codex la unidad de procesamiento cancelable y la puerta de activación de Fase 4. No añadas un menú antes de ese acuerdo. El motor y el HTML son herramientas internas aceptadas, no una pantalla existente.

El diseño de interfaz debe tener dos exportaciones, procedencia de cada una, mapa de campos y claves de correspondencia revisadas, y confirmación del contenido exacto. Cambiar cualquiera de los archivos, reglas, traducciones o claves invalida esa confirmación y cualquier resultado viejo.

Para una unidad de procesamiento independiente, propone Worker o equivalente compatible con el proyecto. Usa el presupuesto agregado aceptado antes del trabajo costoso, límites por ambos lados y progreso comprensible. Cancelar o cambiar entradas no debe publicar resultados tardíos. Mantén la UI utilizable y evita volver a procesar el conjunto solo por cambiar una pestaña de resultados.

Resultados: ausente, no encontrado en una muestra, coincidencia dudosa, relación rota y sin concluir deben conservar sus significados. Muestra recortes con totales reales. confirmedBy sigue siendo un nombre declarado; no firma ni aprobación autenticada. El informe exportado y lo mostrado deben proceder del mismo resultado inmutable.

Si se autoriza construir esa pieza, registra archivos exactos de Worker/cliente/componente/tests antes de editar. El montaje en App queda en una unidad central posterior. Esta misión no debe retrasar el estado de fuentes ni inventar que Fase 4 ya está abierta.

## 8. Lecturas reales: qué avanzar y dónde detenerse

Sigue pendiente la primera comprobación real de HubSpot: portal numérico de ensayo y autorización expresa de las cinco lecturas, además de introducción local de la credencial por el usuario. No hay autorización de Zendesk, Pipedrive, Shopify, producción o escritura por este prompt.

Puedes mejorar el recorrido local de configuración y consentimiento con datos ficticios. Abrir pantalla solo lee estado local. La acción externa autorizada debe mostrar proveedor, cuenta y alcance, y registrar qué se observó y cuándo. Una llamada puntual no acredita sincronización, permisos de escritura ni salud futura.

No leas secretos, instalaciones ni sesiones existentes para buscar un token. Si falta autorización, termina el trabajo local independiente y explica el requisito exacto sin volverlo un bloqueo de toda la tanda.

## 9. Entrega y coordinación durante la tanda

Encadena paquetes sustanciales con dependencias done y rutas libres. Mientras uno está en revisión, trabaja en otro independiente. No trabajes sobre archivos presentados ni multipliques entregas documentales vacías para llenar tiempo. Si todo espera, comunica qué decisión concreta permite continuar.

Claude A posee Hoy, ficha, Jornada y Radar. Este Codex conserva contrato A4, integración central y matriz de candidatas. «Responder saludo» lleva revisiones independientes y custodia CONTEXTO-PROYECTO.md bajo035. Comunica el resumen para esa memoria; no la edites por tu cuenta.

Coordina Chromium antes de arrancar: A3 R2 está en banco del otro Codex. Raíz, base, puerto y procesos propios, red externa bloqueada para ficción, sin tocar 4601. Fuentes congeladas, React de producción para pruebas de candidata, sin contaminación de NODE_ENV=test. Preserva fallos y evidencia; no cierres procesos por patrón.

Cada entrega: comportamiento resuelto, hashes, pruebas realmente ejecutadas, control causal relevante, límites y fila capacidad → entrada visible → API → efecto → evidencia → dueño del montaje. Distingue componente aceptado, montado, verificado en candidata y verificado con proveedor. Revisa teclado, foco, 1440/390/320 y abre las capturas que declares inspeccionadas.

La salida de esta tanda debe reducir deuda de integración y dejar una persona capaz de entender qué fuentes tiene, qué se sabe de ellas y qué puede hacer. Lo interno se inventaría explícitamente; lo disponible en la App se demuestra desde su navegación.
