**API212 R2 aceptada**

5/11/2026, 21:44:17, Europe/Madrid. La dependencia de autorización214 fue aceptada mediante revisión independiente217. Sus cuatro huellas permanecen iguales y las tres fuentes probadas coinciden con el corte a214. Cotejadas de nuevo las cinco huellas R2, se acepta212 como API preparada. Pasaron58 casos relacionados, cinco sondas propias y tipos focales. El registro en el servidor principal y la prueba desde Integraciones siguen como siguiente entrega.

**Comprobación anterior y su condición, ya satisfecha**

**API212 R2 comprobada · aceptación pendiente de la revisión independiente de autorización214**

Las cinco sondas de la primera revisión pasan en el corte privado `tests/.tmp/a214-6b7b7b0c`. El archivo original se conserva. La copia adapta dos líneas para recibir el controlador de seguridad de la factoría y pasarlo como dependencia obligatoria. El resto de las aserciones se mantiene, incluido el bloqueo confirmado antes de soltar la identidad. El análisis focal de tipos sale limpio.

En el mismo corte pasan los 58 casos de212 R2,160 y173. Se verifica la nueva evidencia de cuenta y recorrido, el rechazo de observación futura y el registro válido ante Retry-After inesperado. El módulo exige captura de autorización y verifica la sesión original antes del siguiente despacho y al publicar. Las pruebas de la autora incluyen revocación con la última respuesta pendiente y una sesión nueva.

La revisión se ejecutó sobre las cinco huellas R2 y las tres fuentes de CODEX-LOCAL-AUTHORIZATION-214 presentadas por Codex. La aceptación de212 espera el dictamen independiente de214, que lleva el otro chat. Antes de aceptarla se cotejarán de nuevo las fuentes probadas y ese estado. Las mutaciones comunicadas por Claude permanecen como evidencia de su informe.

Los resultados de 213 R1 siguen debajo como historia. La conexión con el proveedor real y el montaje central conservan sus requisitos propios.

---

**Dictamen anterior sobre R1**

# API de lectura 212 · dictamen independiente

**Devolver para corrección.** Las cinco huellas presentadas y las seis fuentes de las dependencias aceptadas incluidas en el corte coinciden. Pasan las 51 pruebas de API, lectura y transporte. El análisis focal de tipos de las tres suites y las sondas está limpio. Las cinco sondas propias fallan con el contrato registrado en `createBaseApp`, SQLite en memoria y un transporte ficticio.

1. **F1 · La revocación de sesión no detiene una comprobación admitida.** Se retiene la identidad después de despachar el primer GET. La ruta de bloqueo responde 200 y el GET de estado con la misma sesión responde 401. Al soltar la identidad salen los cuatro GET de objetos y se escribe evidencia. La sesión ya estaba revocada. El hook de entrada protege nuevas solicitudes, pero la autorización del POST admitido no se revalida en sus fronteras asíncronas.
2. **F2 · Se acredita evidencia incompatible con el portal y con el recorrido.** Con una revisión que coincide con la configuración, el adaptador devuelve `read_verified` para un portal distinto y, en otra sonda, para un registro con cero peticiones y lista de objetos vacía. Ambas entradas se sembraron expresamente a través de Store. No se demostró que una respuesta normal del proveedor pueda crear esos registros. La validación de forma no basta para acreditar la configuración.
3. **F3 · Una observación futura acredita la lectura ahora.** La comprobación almacenada está fechada una hora después del reloj actual y su fin de vigencia aún no ha pasado. El estado es `read_verified`. La actualidad debe evaluar también el comienzo de la ventana y acotar su duración.
4. **F4 · La propia API persiste evidencia que luego rechaza.** Una identidad ficticia responde 429 con `Retry-After: 0.4`. Tras un GET se guarda `retryAfterSeconds: 0`, fuera del esquema público, y el POST devuelve 200 con `EVIDENCE_UNREADABLE` y sin evidencia. Un valor inesperado de cabecera debe descartarse o normalizarse y el resultado se debe validar antes de guardar.

## Evidencia y alcance

Corte privado `tests/.tmp/h212-142b7b32`, 131 entradas. Los 51 casos originales incluyen servidores efímeros en loopback y el subproceso de la CLI con bloqueo de red externa. Las cinco sondas propias usan `app.inject`, el hook real de autenticación y un fetch inyectado que cuenta despachos en memoria. Los resultados constan en `author.log`, `independent.log`, `typecheck.log` y el manifiesto. No se consultó al proveedor real. Quedan pendientes el montaje central, el contrato de revocación en él y una decisión separada de autorización para un ensayo real.
