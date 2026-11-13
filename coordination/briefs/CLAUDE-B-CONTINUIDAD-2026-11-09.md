# Claude B · Fuentes verificables y llegada a Integraciones

9 de noviembre de 2026, Europe/Madrid. Continúa la sesión de adaptadores, procedencia, integraciones y migraciones. La salida de esta tanda es una vista que permita distinguir qué fuente está configurada, qué se intentó leer, qué se observó, cuánta cobertura tiene y qué puede hacer la persona. Lleva lo ya construido hasta un recorrido demostrable en la App. Antes de ampliar a otro proveedor, cierra las correcciones y el montaje de estas piezas.

## 1. Corte de tus últimas entregas

- Zendesk R3 está `done`. El adaptador y su transporte ya tienen una revisión aceptada. Las pruebas usaron un proveedor ficticio.
- Pipedrive está en `working` para R2 bajo el dictamen 295. El tablón conserva sus cuatro rutas. La presentación original pasó 14 pruebas y el revisor reprodujo fallos de flags y calendario. La devolución permanece abierta.
- `CLAUDE-SOURCE-INTEGRATIONS-CONTRACT` está en `working` para R2 bajo el dictamen 296. Conserva sus tres rutas. El revisor reprodujo una lectura acreditada sin observación y una autorización posterior al intento.
- CORE de migraciones y VISUAL 294 R2 están aceptados. La representación de caracteres de dirección y delimitadores ya distingue dos IDs diferentes. El revisor repitió 32 pruebas de la autora, cuatro sondas originales y cuatro recorridos Chromium. Motor, informe y presupuesto siguen disponibles como módulos internos. La interfaz de migraciones tiene una puerta de fase propia.
- Codex terminó y aceptó el diario cifrado 297 y el GET local de historial 298. El primero guarda recibos sin acreditar un proveedor. El segundo consulta metadatos de una fuente ficticia fijada por su anfitrión. Tienen revisiones independientes de 47 y 50 pruebas, respectivamente. Registro central de autorización, pantalla y montaje siguen pendientes.
- Claude A presentó la petición de instalación para el portal personal HubSpot 149623262, con sesión web comunicada. El ensayo está coordinado por Codex. La configuración y lectura API necesitan sus pasos propios. Jornada R3 ya se sirve en 4601 mediante 299, que sigue en revisión de publicación.

Relee el tablón, los dictámenes y el contrato de la unidad antes de actuar. Declara tu sesión y rutas exactas. Usa `claim` y `check-path` antes de editar. `review` conserva las reservas. Claude A controla Jornada, Radar y ficha. El coordinador reserva registro de fuentes, `App.tsx`, `server/main.ts` y los montajes centrales. Usa raíces, puertos y ventanas propios para cada ensayo.

## 2. Cierra Pipedrive R2 con evidencias causales

Lee `coordination/briefs/CLAUDE-SOURCE-PIPEDRIVE-R2-295.md` y el dictamen independiente. Corrige dentro de las cuatro rutas existentes.

- Si `is_deleted` o `is_archived` llegan con un valor ilegible, conserva el desconocimiento y explica el descarte con la categoría del contrato. El objeto no puede aparecer como oportunidad completada con cobertura completa por interpretar una cadena como false. Conserva controles para true, false y el comportamiento documentado de los campos ausentes.
- Valida fecha de calendario, hora y desfase antes de ordenar duplicados. El caso de una oportunidad perdida con fecha válida seguida del mismo ID ganado con 30 de febrero no puede reemplazar el registro válido por una fecha normalizada. Incluye 31 de abril y hora 24 junto con casos positivos de bisiesto y desfase admitido. Mantén cobertura parcial cuando el conjunto tenga duplicados u omitidos según el contrato.
- Repite las 14 anteriores y reproduce las sondas del revisor con la versión antigua y la corregida en copias privadas. Conserva aserciones y valores observados. Si mantienes un tamaño de página de 100, documenta que es una política del lector y deja la referencia oficial en el dictamen. Las pruebas sintéticas acreditan comportamiento del lector con ese contrato.

Presenta R2 con hashes y límites. Mantén `shared/source-reading.ts` y el transporte de Zendesk bajo su versión aceptada. Cualquier cambio compartido tiene una unidad y un revisor propios. Mientras Codex revisa Pipedrive, sigue por SourceStatus.

## 3. Cierra SourceStatus R2 y fija el lenguaje de producto

Lee `coordination/briefs/CLAUDE-SOURCE-STATUS-R2-296.md`. Usa el adaptador aceptado para reproducir credencial ausente, cancelación antes de emitir petición y fallo de red tras iniciar una petición sin obtener una página. Esos intentos pueden tener una causa y una siguiente acción. La vista debe conservar recuento desconocido y reflejar que no se observó la lectura. Una respuesta de error y una lectura útil tienen evidencias diferentes.

La autorización que respalda un intento tiene que corresponder a proveedor, cuenta, objeto y alcance. `authorizedAt` debe preceder o coincidir con `startedAt` según la política acordada. Conserva el caso positivo de autorización previa y rechaza la atribución retrospectiva. Si el esquema solo representa una autorización declarada por el anfitrión, documenta ese límite. El anfitrión debe autenticarla al ejecutar.

Define una matriz de textos y acciones. Incluye configuración preparada, ensayo ficticio, intento sin lectura útil, lectura parcial y lectura observada dentro del alcance. Separa cuenta configurada, identidad observada, vigencia y acceso actual. El atributo `connected` conserva la regla acordada. Una lectura fallida sin datos se presenta como desconocida, con su causa. Distingue asimismo un listado observado vacío de la ausencia de recibos locales.

Repite las ocho pruebas originales y las seis sondas independientes sin suavizarlas. Presenta la corrección y el traspaso de textos con las tres rutas reservadas. Las pruebas de DOM y la consulta de estado local van en la siguiente unidad. Si cambia el contrato de la vista, informa a Codex y actualiza el plan antes de empezar el consumidor.

## 4. Construye el consumidor visible de historial y procedencia

Usa el contrato aceptado de `CODEX-SOURCE-READING-HISTORY-298`. Acuerda con Codex y registra una unidad con rutas nuevas como `src/SourceReadingHistory.tsx`, su cliente, estilos, pruebas e informe. Son rutas candidatas hasta que la unidad tenga su reserva. El componente recibe del anfitrión el ámbito permitido. La query del cliente solo selecciona esa fuente y el objetivo exacto.

Construye una vista compacta para Integraciones. La primera línea identifica fuente, cuenta y entorno. Luego se muestra el último resultado local y un botón de historial cuando haya una acción soportada. Presenta cada recibo con hora observada y hora guardada, causa, cobertura y recuento local. Mantén el orden de inserción que fija el contrato. «Último guardado» y «observación más reciente» pueden ser distintos.

Pide los datos a través del GET real registrado en el banco con un ámbito inyectado y ficticio, usando SQLite y el diario 297. No uses respuestas de éxito inventadas para cerrar el recorrido de integración. El banco debe poder abrir la vista, cargar dos páginas, guardar una lectura de ensayo desde el arnés y comprobar que un cursor viejo invalida la continuación. Al refrescar, conserva solo los datos del nuevo corte. Prueba bloqueo, cambio de cuenta, cambio de captura y respuestas tardías que lleguen después de abortar.

| Situación | Comportamiento que debe verse |
| --- | --- |
| No hay recibos de la fuente autorizada | Vacío de historial local con su alcance |
| Se desconoce el número de registros | Recuento desconocido con causa, sin convertirlo en cero |
| Lectura parcial | Cobertura parcial y causa de parada |
| Diario corrupto o consulta indisponible | Mensaje de indisponibilidad y opción de reintentar la lectura local |
| Cambio de ámbito, sesión o revisión | Retira datos antiguos y vuelve a consultar el corte permitido |
| Cuenta ajena o cursor incompatible | Error de ámbito o de revisión sin publicar recibos de otro contexto |

Evita mostrar etiquetas, cuerpos, valores o referencias de registros desde esta ruta. El botón Actualizar consulta el estado local. La vista aporta evidencia de lo guardado, con la procedencia de ensayo visible. La lectura al proveedor, cuando exista, tiene un control separado con su autorización.

El montaje central espera el registro de fuentes y alcance del coordinador. Tu entrega incluye props exactas, estados y un cambio mínimo para el dueño de Integraciones. Presenta el consumidor en arnés con su alcance real. La candidata se acepta cuando se abre desde la navegación habitual, consulta la API del servidor compilado y conserva el ámbito tras reinicio. Reserva esa QA con archivos propios y acuerda quién puede usar Chromium.

## 5. Cierra dos deudas visibles de Continuidad

Usa el informe `CLAUDE-WORK-SUMMARY-QA`. Propón al dueño central un paquete pequeño y comprobable que separe falta de cobertura de un fallo de lectura en pasaporte y mapa. El resumen puede tener recuentos nulos aunque el lector funcione correctamente. La redacción debe expresar la causa que acredita el contrato.

Revisa también el botón «Abrir Trabajo por recuperar». Cuando A4 tenga destino y contrato aceptado, enlázalo al mismo contexto. Mientras la capacidad esté pendiente, el usuario necesita un estado claro y un siguiente paso que sí exista. Coordina con Claude A para mantener una sola superficie de recuperación. Conserva una lectura compartida del resumen y el mismo pin para tarjeta, pasaporte y mapa.

El paquete necesita rutas acordadas antes de tocar `ContinuityHome` o `ContinuityHub`. Puedes avanzar una prueba reproducible en una unidad propia. Verifica error, ausencia de cobertura, vacío cubierto y cambio de copia sin respuestas tardías. La prueba del lector con una fixture de cobertura no acredita el escritor A4.

## 6. Conexión real y puente al Radar

El piloto HubSpot se coordina con Claude A y Codex sobre el portal personal identificado. Tu papel es comprobar procedencia, interpretación de resultados y correspondencia con el contrato de la pantalla. Lee `HS-PILOT-INSTALL-REQUEST.md`, el runbook 173 y el informe 218. El usuario controla la entrada de la credencial. Codex conserva el mando de la ejecución real. Si falta el dato o el alcance, informa del paso pendiente con precisión y continúa el trabajo ficticio independiente.

La comprobación acotada de cinco GET identifica la cuenta y comprueba un registro de contactos, empresas, oportunidades y tareas. El formulario existente de configuración inspecciona también esquemas antes de guardar la conexión. Coordina esos alcances por separado. Comprueba tipo y cuenta con el resultado devuelto. La sesión web ya comunicada no demuestra autenticación API. Si el tipo es STANDARD, la ruta de ensayo no acredita esa cuenta. Tramita el flujo compatible con el coordinador, con su revisión y consentimiento de operación.

Cuando exista evidencia real autorizada, muestra el resultado por objeto y el instante del intento dentro del flujo aceptado. Conserva respuestas parciales y expiración. El GET de historial 298 está limitado a ficción y a `SourceReading`. La comprobación HubSpot produce su propio contrato. Diseña cualquier puente entre ellos bajo una unidad revisada. Evita convertir metadatos de un intento en registros de CRM importados.

Después de aceptar los adaptadores y el puente, prepara un recorrido multisistema con los lectores aceptados y servidores de prueba en loopback. Conserva proveedor, cuenta, objeto, ID, fecha y cobertura de cada observación. Los contactos, organizaciones y actividades de contexto de Pipedrive no aportan estado de compromiso por sí solos. Los vínculos se basan en una referencia explícita o decisión humana. Conserva los candidatos ambiguos separados.

La puerta de producto se prueba desde el Radar montado. Una instalación bloqueada debe indicar la evidencia del pedido y el ticket, una lectura parcial debe limitar la conclusión y una cuenta con el mismo ID remoto debe permanecer separada. Cualquier pedido ficticio conserva su procedencia aunque otra fuente tenga un resultado observado real. Un nuevo proveedor requiere su cuenta, alcance y prueba propios.

## 7. Siguiente apuesta · Verificador de migraciones utilizable

Con CORE y VISUAL aceptados, deja preparada la unidad de interfaz de Fase 4 con su dueño y puerta. Si el coordinador confirma que se abre esa fase, reclama una unidad separada para carga local y procesamiento cancelable. Reutiliza el motor, el informe y el presupuesto aceptados.

La persona carga dos exportaciones, confirma su procedencia, revisa claves y mapas de campos y autoriza comparar ese contenido exacto. Un cambio de archivo, regla o clave invalida la confirmación y el resultado anterior. Comprueba límite agregado antes de parsear. Si el volumen lo exige, trabaja en un Worker con progreso que represente trabajo medido. Cancelar o cambiar de contexto descarta la publicación tardía. Preserva los informes previos solo cuando el usuario tenga una acción explícita que los identifique por su corte.

Presenta ausencias, coincidencias dudosas, diferencias y relaciones rotas con significado separado. El nombre declarado por la persona se muestra como declaración. El informe HTML y JSON se generan del mismo resultado y preservan originales. Repite el caso de controles Unicode y notación literal, el recorte con total, zonas horarias y textos largos. Mide el tiempo y tamaño de una fixture grande dentro del presupuesto y conserva máquina y corte para interpretar la medida.

Prioriza antes el estado de fuentes y el historial. Si la fase de migraciones sigue cerrada, deja lista la tarea concreta y avanza una dependencia que sí pueda aprobarse. El resultado se declara visible tras montar la entrada y comprobar la carga, comparación, cancelación y exportación desde la App.

## 8. Orden de trabajo y salida

Empieza con 295 R2 y 296 R2. Mientras se revisan, acuerda el consumidor de 298, que ya tiene contrato de historial aceptado. Tras eso coordina montaje y QA de Integraciones. Lleva los dos hallazgos de Continuidad a su dueño y evita duplicar el piloto de HubSpot. Avanza al puente y a migraciones cuando las puertas estén abiertas.

Por entrega adjunta huellas, prueba causal del defecto cuando proceda y resultado de las pruebas ejecutadas. Para un montaje conserva manifiesto de fuentes, versión del servidor y activos servidos. Verifica los estados en teclado y 1440/390/320. Atribuye los resultados ajenos y las pruebas con red ficticia a su banco. Presenta la unidad y deja de editar esas rutas mientras se revisan.

Termina con un guion reproducible desde Integraciones. La persona debe poder explicar qué cuenta y fuente está viendo, cuándo se obtuvo la evidencia, qué cobertura tiene y qué acción puede tomar. Para lo que siga pendiente, deja la ruta de montaje, el dueño y la aceptación requerida. El tablero de salida distingue componente aceptado, montaje publicado, prueba de candidata y observación con proveedor.
