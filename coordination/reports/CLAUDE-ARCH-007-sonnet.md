# CLAUDE-ARCH-007 · Contratos genéricos de captura CRM robusta

Autor: agente `claude` (Sonnet 5.5). Fecha: 2026-10-31.

## 0. Estatus del documento (leer primero)

- Todo lo que sigue es **propuesta conceptual**. No se ha leído ni ejecutado código del repositorio (solo `CLAUDE.md` y el brief), no se ha ejecutado ninguna prueba y no ha habido acceso a HubSpot, a ningún CRM ni a credenciales.
- Por tanto, **nada de este informe es "código comprobado"**. No se afirma que el repositorio cumpla, incumpla o implemente ninguno de estos contratos; esa verificación es trabajo futuro (ver sección 5, UT-1).
- Los comportamientos de APIs reales (por ejemplo, qué cabeceras envía un proveedor concreto, si existe `Retry-After`, la semántica exacta de cursores) se tratan como **hipótesis genéricas** y deben confirmarse contra la documentación o pruebas aisladas del proveedor antes de apoyarse en ellas.
- Terminología: "origen" = el CRM remoto; "almacén local" = donde se persiste lo capturado; "captura" = una ejecución completa de lectura del origen; "página" = una respuesta paginada.

## 1. Modelo conceptual

### 1.1 Captura
Una captura es una **transacción lógica de lectura** con ciclo de vida explícito:

`planificada -> en curso -> (completa | parcial | fallida | abandonada)`

Cada captura tiene: identificador propio, alcance declarado (qué tipos de objeto, qué ventana temporal o filtro), versión del esquema de lectura, marca de inicio, y un **punto de reanudación** (cursor persistido por tipo de objeto). Una captura produce un *lote de observaciones*; el lote solo se "publica" (se hace visible como estado vigente) si el resultado es **completo** para el alcance declarado. Un resultado parcial se conserva y se etiqueta, nunca se presenta como completo.

### 1.2 Identidad
- Clave canónica local = `(cuenta/portal de origen, tipo de objeto, id estable del origen)`. El id del origen es la única fuente de identidad; nunca se usa nombre, correo ni teléfono como clave.
- Cada observación guarda: id de origen, tipo, carga útil normalizada, marca de modificación del origen (si existe), marca de captura local, id de captura y huella (hash) del contenido normalizado.
- Las fusiones o duplicados del origen se modelan como **eventos de identidad** (alias -> id superviviente), no como borrado silencioso.
- Relaciones (asociaciones) se capturan como aristas con extremos `(tipo, id)`; una arista cuyo extremo no se ha capturado es válida pero queda "colgante" y visible como tal.

### 1.3 Paginación
Modelo abstracto: una consulta devuelve `{elementos[], cursor_siguiente?}`. El cursor es **opaco**: el cliente no lo construye ni interpreta, solo lo almacena y lo reenvía. La captura termina cuando el origen indica ausencia de cursor siguiente, **no** cuando una página viene vacía o corta.

### 1.4 OAuth
Estado de credencial como máquina: `ausente -> autorizada -> (expirada <-> refrescando) -> (revocada | inválida)`. El token de acceso es efímero; el de refresco es el secreto de larga vida. La renovación es una operación **exclusiva** (un solo refresco en vuelo por conexión).

### 1.5 Reintentos
Política declarativa por clase de error: reintentable (429, 5xx, red), no reintentable (4xx de cliente salvo 408/429), e **indeterminada** (timeout tras enviar). Las lecturas son idempotentes por naturaleza; cualquier escritura necesita clave de idempotencia o comprobación previa.

## 2. Invariantes

Formulados para poder convertirse en aserciones. `I-xx` son propuestas.

**Identidad y datos**
- I-01. La identidad local de un registro es única por `(origen, tipo, id)`; reaplicar la misma observación es idempotente (mismo estado final).
- I-02. Una captura nunca crea un registro local con id inventado o derivado de datos de contacto.
- I-03. Un registro ausente en una captura **no** se interpreta como borrado salvo que la captura sea completa para ese alcance y el origen distinga "no devuelto" de "eliminado".
- I-04. Los campos desconocidos o nulos del origen no sobrescriben valores locales ya capturados salvo semántica explícita de "vaciado" (null != ausente).
- I-05. Los datos introducidos o corregidos localmente por el usuario nunca se pierden por una captura; los conflictos se registran, no se resuelven en silencio.

**Integridad de la captura**
- I-06. Una captura se publica de forma atómica o no se publica: el estado vigente anterior sigue válido hasta que la nueva captura completa se confirma.
- I-07. Una captura parcial está siempre marcada como parcial, con motivo y alcance cubierto; la interfaz no puede mostrarla como completa.
- I-08. El cursor persistido solo avanza **después** de persistir la página que lo produjo (orden: escribir página, luego guardar cursor), de modo que un fallo repite, nunca omite.
- I-09. Deduplicación por id dentro de una misma captura: ver el mismo id dos veces (solapamiento de páginas) no duplica ni corrompe.
- I-10. El conteo de elementos observados es registrado; si el origen ofrece un total, la discrepancia se anota, no se oculta.

**Paginación**
- I-11. Los cursores son opacos y no se reutilizan entre capturas, consultas distintas ni sesiones (pueden caducar).
- I-12. Una página vacía con cursor siguiente presente no es el final; una página sin cursor siguiente sí lo es, aunque venga llena.
- I-13. Todo bucle de paginación tiene cota dura (máximo de páginas y de tiempo) y detección de ciclo (mismo cursor repetido) que aborta como fallo explícito.
- I-14. El tamaño de página pedido nunca supera el máximo documentado del origen; si el origen devuelve menos de lo pedido, no es señal de fin.

**OAuth**
- I-15. Solo existe un refresco simultáneo por conexión; las demás peticiones esperan el resultado o fallan limpiamente.
- I-16. El refresco puede rotar el token de refresco; el nuevo se persiste de forma atómica antes de descartar el antiguo, y un refresco fallido nunca borra el token vigente.
- I-17. El parámetro `state` es de un solo uso, ligado a la sesión/usuario que inició el flujo, con caducidad corta; un callback sin `state` válido se rechaza sin efectos.
- I-18. Revocación o `invalid_grant` pasa la conexión a "requiere reautorización": se detienen las capturas, se conserva lo ya capturado y no se reintenta indefinidamente.
- I-19. Secretos (tokens, códigos, `state`) nunca aparecen en logs, errores mostrados ni informes.
- I-20. El alcance (scopes) concedido se compara con el requerido antes de capturar; la falta de alcance es un fallo de configuración, no un reintento.

**Reintentos**
- I-21. Reintentos con retroceso exponencial, **jitter** y tope de intentos y de tiempo total; `Retry-After` (si existe) manda sobre el cálculo propio, con un techo máximo.
- I-22. 4xx de cliente distintos de 408/429 no se reintentan (salvo un único refresco de token ante 401).
- I-23. Un 429 reduce la concurrencia/ritmo de forma global para la conexión, no solo para la petición afectada.
- I-24. Reintentar una lectura no altera el estado local más allá de lo que lo alteraría el primer intento (consecuencia de I-01 e I-08).
- I-25. Toda operación de escritura reintentable lleva clave de idempotencia o verificación previa del estado; si no existe ninguna, el resultado ante un timeout es "indeterminado" y se concilia, no se repite a ciegas.

## 3. Matriz de fallos y efecto esperado

| # | Fallo | Detección | Efecto esperado | Estado final de la captura |
|---|-------|-----------|-----------------|----------------------------|
| F1 | 429 con `Retry-After` | código 429 | Esperar lo indicado (con techo), reducir ritmo global, reintentar la misma petición | Continúa; si se agota presupuesto -> parcial |
| F2 | 429 sin `Retry-After` | código 429 | Retroceso exponencial con jitter, reducir concurrencia | Igual que F1 |
| F3 | 5xx transitorio (500/502/503/504) | código | Reintentar con límite; mismo cursor | Continúa o parcial al agotar |
| F4 | Error de red / timeout de lectura | excepción | Tratar como reintentable (lectura idempotente) | Continúa o parcial |
| F5 | Timeout en escritura (resultado desconocido) | excepción tras envío | No repetir a ciegas: conciliar por lectura/clave de idempotencia | Marcar "indeterminado" hasta conciliar |
| F6 | 401 con token expirado | código/cuerpo | Un único refresco exclusivo y reintento de la petición | Continúa; si el refresco falla -> F8/F9 |
| F7 | 403 por falta de scope | código/cuerpo | No reintentar; marcar configuración insuficiente | Fallida o parcial por tipo afectado |
| F8 | Refresco fallido transitorio (red/5xx) | refresco | Reintentar refresco con retroceso; conservar token vigente | Pausada; reanudable |
| F9 | `invalid_grant` / token revocado / consentimiento retirado | respuesta de token | Detener, estado "requiere reautorización", conservar datos y cursor | Parcial/pausada; no se reintenta sin acción humana |
| F10 | Dos refrescos concurrentes y rotación del refresh token | condición de carrera | Serializar (I-15); el perdedor reutiliza el resultado del ganador | Sin pérdida de credencial |
| F11 | Callback OAuth con `state` ausente, repetido, caducado o de otra sesión | validación | Rechazar sin efectos ni consumo de código | Sin cambio en la conexión |
| F12 | Cursor caducado/inválido | 4xx específico | No inventar un cursor; reiniciar el tipo desde el principio de su ventana manteniendo dedup | Reintento controlado con marca |
| F13 | Página vacía con cursor siguiente | respuesta | Continuar paginando (I-12) | Continúa |
| F14 | Página sin cursor pero menor que el límite | respuesta | Fin legítimo | Completa para ese tipo |
| F15 | Cursor repetido / bucle infinito | detección de ciclo | Abortar el tipo como fallo explícito (I-13) | Fallida para ese tipo, no cuelga |
| F16 | Registros creados/modificados/eliminados durante la captura | solapamiento, huecos | Aceptar solapes (dedup) y posibles huecos; segunda pasada de reconciliación desde la marca de inicio de captura menos un margen | Completa solo tras la pasada de cierre; si no, "completa con riesgo declarado" |
| F17 | Mismo registro visto en dos páginas con versiones distintas | dedup | Gana la versión con marca de modificación mayor; si no hay marca, la última vista y se anota | Completa |
| F18 | Registro fusionado en el origen | alias/404 en id antiguo | Registrar evento de identidad; no duplicar ni borrar | Completa |
| F19 | Respuesta malformada / esquema inesperado | validación | Registrar el elemento como rechazado con motivo; no abortar todo salvo umbral de rechazos | Parcial si hay rechazos |
| F20 | Interrupción del proceso a mitad | reinicio | Reanudar desde el último cursor persistido (I-08) | Reanudada; sin pérdida, solapes tolerados |
| F21 | Disco/almacén local lleno o error de escritura | excepción local | Detener sin avanzar cursor; estado vigente intacto (I-06) | Fallida/pausada |
| F22 | Captura simultánea de la misma conexión | bloqueo | Una sola captura activa por conexión; la segunda espera o se rechaza | Sin corrupción |
| F23 | Reloj local desfasado | comparación de marcas | No basar la ventana de reconciliación solo en reloj local; preferir marcas del origen | Ventana ampliada |
| F24 | Datos locales editados por el usuario y cambio remoto concurrente | huella distinta | Registrar conflicto (I-05) | Completa, con conflictos pendientes |

## 4. Casos de prueba de alto valor (12)

Todos son **propuestos**: no existen como código comprobado en este informe. Se pensaron para ejecutarse **contra un simulador local aislado del origen** (servidor falso determinista), jamás contra un CRM real ni con credenciales reales.

1. **Cursor tras fallo: repetir, no omitir.** El simulador falla con 503 justo después de entregar la página N. Verificar que el cursor persistido corresponde a N-1 (o N solo si N ya se escribió), que la reanudación no pierde ningún id y que los duplicados se absorben (I-08, I-09, F3, F20).
2. **Página vacía intermedia.** Secuencia: página con datos, página vacía con cursor siguiente, página con datos, página final sin cursor. Verificar que se capturan todos los datos y que la captura termina solo en la última (I-12, F13).
3. **Fin legítimo con página corta.** Última página con menos elementos que el límite y sin cursor: captura completa; y caso contrario, página llena sin cursor también cierra (I-12, F14).
4. **Cursor cíclico.** El simulador devuelve el mismo cursor indefinidamente. Verificar aborto explícito con cota y sin consumo ilimitado de tiempo ni memoria (I-13, F15).
5. **Cambios durante la captura.** Entre páginas el simulador inserta, modifica y elimina registros. Verificar dedup, versión ganadora por marca de modificación, pasada de reconciliación y etiqueta de resultado correcta (completa con riesgo declarado o completa) (I-03, I-09, F16, F17).
6. **429 con y sin `Retry-After`.** Reloj simulado (sin esperas reales). Verificar que se respeta la espera indicada con techo, que sin cabecera hay retroceso con jitter acotado, que se reduce la concurrencia global y que se agota el presupuesto en parcial etiquetado (I-21, I-23, F1, F2).
7. **Clasificación de errores.** Tabla de códigos (400, 401, 403, 404, 408, 409, 422, 429, 500-504, corte de red): verificar cuáles se reintentan, cuáles no y que 401 provoca como máximo un refresco (I-22, F3, F4, F6, F7).
8. **Refresco concurrente con rotación.** N peticiones simultáneas reciben 401; el simulador rota el token de refresco en cada refresco. Verificar que solo ocurre un refresco, que todas reutilizan el resultado, y que el token nuevo se persiste atómicamente (I-15, I-16, F10).
9. **Revocación a mitad de captura.** El simulador responde `invalid_grant` durante la captura. Verificar parada limpia, estado "requiere reautorización", datos y cursor conservados, cero reintentos infinitos y ausencia de secretos en logs (I-18, I-19, F9).
10. **`state` OAuth.** Callback con `state` ausente, ajeno, repetido (segundo uso) y caducado: todos rechazados sin consumir código ni modificar la conexión; el válido funciona una sola vez (I-17, F11).
11. **Escritura con timeout indeterminado.** Si el diseño llega a escribir al origen: el simulador aplica la operación pero corta la respuesta. Verificar que no se duplica el efecto al reintentar (clave de idempotencia o conciliación previa) y que mientras tanto el estado es "indeterminado" (I-25, F5).
12. **Identidad: fusión y ausencia.** Un id desaparece de la captura (a) por borrado, (b) por fusión con alias, (c) por no devuelto por filtro. Verificar tratamiento distinto de cada uno y que nunca se inventa un id ni se borra con captura parcial (I-02, I-03, F18).

Nota: el caso de interrupción de proceso (F20), edición local concurrente (F24) y fallo de disco (F21) quedan cubiertos solo de forma parcial (F20 por el caso 1, F24 por el caso 5; F21 no tiene caso propio); si hace falta ampliar, requeriría un encargo aparte (el límite de doce es deliberado).

## 5. Tres unidades de trabajo futuras disjuntas

Propuestas, sin estimación fiable (no se ha leído el código). La disjunción se define por **superficie de responsabilidad**: no deben compartir ficheros ni contratos de datos modificados simultáneamente; la integración la coordina Codex.

### UT-1 · Auditoría de brechas y banco de pruebas aislado (solo lectura + pruebas nuevas)
- Objetivo: contrastar I-01..I-25 y F1..F24 con el código real y construir un **simulador de origen determinista** (servidor falso local, reloj inyectable) para ejecutar los 12 casos.
- Entrega: informe de brechas con evidencia por invariante (cumple / no cumple / no verificable) y archivos de prueba nuevos y propios.
- Disjunción: no modifica código de producción; solo añade ficheros de prueba y un informe. Es prerrequisito informativo de las otras dos pero no las bloquea técnicamente.
- Cuidado: nunca con credenciales reales, nunca con `data/` ni instalaciones locales del piloto.

### UT-2 · Contrato de paginación, identidad y cierre de captura
- Objetivo: implementar o corregir el ciclo de vida de captura (completa/parcial/fallida), el orden "escribir página, luego cursor", dedup por id, detección de ciclo y cotas, reconciliación de cierre y eventos de identidad (I-01..I-14, F12..F20, F24).
- Disjunción: toca únicamente la capa de captura/almacenamiento local de lo capturado; no toca autenticación ni la política de reintentos (consume ambas por interfaz).
- Requiere encargo que reserve explícitamente esos archivos y cualquier contrato/esquema común afectado (CLAUDE.md prohíbe tocar esquema común sin reserva expresa).

### UT-3 · Contrato de transporte: OAuth y reintentos
- Objetivo: cliente de transporte con refresco exclusivo y atómico, tratamiento de revocación y `state` de un solo uso, clasificación de errores, retroceso con jitter, `Retry-After` con techo y limitación global de ritmo (I-15..I-25, F1..F11, F21-F23 en lo que afecte).
- Disjunción: capa de transporte/credenciales; expone a UT-2 solo una interfaz `solicitar(petición) -> resultado | error clasificado`. No toca el modelo de captura.
- Cuidado de seguridad: sin leer, copiar ni registrar secretos; pruebas solo con simulador y valores de prueba generados.

Orden sugerido (no obligatorio): UT-1 -> UT-3 y UT-2 en paralelo, integración por Codex.

## 6. Límites explícitos

- Sin lectura de código del repositorio, sin ejecución, sin red, sin MCP, sin acceso a HubSpot ni a otros CRM, sin datos de clientes ni credenciales.
- Las afirmaciones sobre cabeceras, códigos y comportamiento de proveedores son genéricas y no verificadas; HubSpot en particular **no** se ha consultado.
- Los 25 invariantes y 24 fallos son una propuesta de modelado; pueden ser excesivos para el alcance real y deberían priorizarse tras UT-1.
- No se atribuye a este informe ninguna prueba ejecutada ni conformidad del código existente.
