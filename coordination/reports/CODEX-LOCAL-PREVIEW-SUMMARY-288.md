# Demo288 · Resumen de trabajo instalado y verificado

8/11/2026, Europe/Madrid. Codex. **Demo local actualizada y en marcha:** http://127.0.0.1:4601/. Misma instalación independiente creada en278, misma identidad y62registros ficticios. La entrega de código284 ya había sido aceptada por el otro chat. Esta entrega288 se presenta para revisión independiente, sin autoaceptación.

## Instalación actual

| Dato | Valor |
| --- | --- |
| Raíz de evidencia288 | `tests/.tmp/preview288-bngxpH` |
| Recibo vigente | `tests/.tmp/preview288-bngxpH/applied.json` |
| Instalación | `tests/.tmp/preview278-SRZe1u/installation` |
| Proceso actual | PID22988, Node, oculto y separado del navegador del usuario |
| Identidad | `3cb33118-1596-44cc-b78a-b2961615f4ff` |
| Main instalado SHA-256 | `165e06560ff938b942634a79f1180b257a863dc5d0a789b23c79f312c5f5625b` |
| Fuentes fijadas | 304 del corte aceptado284, sin JornadaA3 en trabajo |
| Activos | 15, cotejados por HTTP y SHA-256 |
| Datos | misma SQLite, clave de ensayo y Kit,62registros |

Los recibos históricos278/279 conservan sus PIDs/binarios de sus fechas: **no usar PID19880 para describir o detener el servicio actual**. `preview288-latest.json` apunta a la preparación; leer su `root/applied.json` para el estado aplicado.

## Qué cambia

Continuidad incorpora el resumen255 y el lector283 montados en284. Espera una referencia de copia autorizada, comparte una lectura con el Hub y permite releer/exportar. Muestra «Sin cobertura: se desconoce», con recuentos nulos. `covers:false` sigue siendo obligatorio hasta que A4 acredite cobertura duradera; no se ha habilitado escritura ni recuperación de borradores.

El build usa la composición304verificada por autor y revisor284, no el checkout activo de Claude. Se compilaron main y UI React de producción en carpeta nueva, sin root build/dist ni npm run build. El bundle no contiene ReactDOM de desarrollo. Una segunda compilación con entorno mínimo produjo los mismos15activos por hash; la herramienta conserva ese aislamiento del entorno al compilar.

## Herramienta y aplicación reversible

`tools/preview/update-work-summary.mjs` tiene alcance deliberadamente fijo a esta demo ficticia. `--prepare` construye sin tocar el servicio. `--apply` requiere284done y huellas actuales, verifica origen/instalación/PID con CIM, salud/identidad, configuración sin contraseña y clave de ensayo, ausencia de configuración de proveedores, binario y activos antiguos, Kit y otros recursos originales. No admite rutas de restauración aportadas por HTTP ni es un instalador general.

Antes del reinicio hace backupSQLite y comprueba contenido. Archiva binario/dist, detiene únicamente el PID propio acreditado, instala y arranca el nuevo proceso con entorno mínimo y bloqueo de salida externa. Comprueba salud, GET del resumen sin caché, todos los activos HTTP/SHA y datos. Un fallo conserva los activos fallidos y restaura binario/dist anteriores; no sobrescribe la base con el backup.

**Rollback realmente ejercido:** primera aplicación arrancóPID31804, pero falló mi comparación de bytes cifrados. Revirtió a main277/UI279 yPID2984. La comparación independiente de todas las tablas encontró una sola celda distinta: `meta.returnBusy`. El arranque de recuperación reescribe false usando un nonceAES-GCMnuevo. Con la clave ficticia de esta instalación se comprobó que el contenido antes/después es exactamente false. Ninguna fila de registros cambió. El informe inicial de rollback conserva `dataUnchanged:false` porque entonces medía ciphertext; no se ha ocultado ni reescrito.

La corrección compara hashes de texto plano de cada celda cifrada, conservando todas las tablas, filas, columnas y restantes valores. No excluye returnBusy ni ignora una tabla. La segunda aplicación comprueba además el backup de la primera: mismo digest semántico `5b3001342ec51daa30f60cbc285a29b4b195e06943338082fcb5e51621aa5424`. No se modifica o copia una claveDPAPI; solo la nueva clave de ensayo propia. Segundo intento `apply-hIazEP` termina correctamente, PID22988. La clave conserva su hash (no se publica), el Kit y restantes recursos originales conservan sus huellas.

Los archivos anteriores están en `installation/build/server-before288.mjs` y `installation/dist-before288`. Los backups y logs de ambos intentos permanecen bajo la raíz de evidencia; no se realizó borrado recursivo. Una aplicación repetida se rechaza si ya existe applied.json.

## Verificación actual de App

`tests/.tmp/check-preview288.cjs`, Chromium de caché de Playwright con perfil efímero propio, red externa y métodos modificadores bloqueados:

- Navegación habitual a Continuidad: resumen visible sin cobertura, sin listas de contadores falsas; GET real devuelve counts/quarantine null y procedencia durable.
- Una petición de resumen al abrir, ninguna adicional durante3,5s; «Leer de nuevo» con teclado produce la segunda. Es observación de ese intervalo, no garantía de vigilancia permanente.
- Exportación JSON real de852bytes, situaciónuncovered y countsnull.
-1440/390/320px sin desbordamiento horizontal; Hoy conserva su lista de tareas. Capturas completas guardadas. Las de página móvil eran demasiado largas para lectura detallada, por lo que se capturó además la tarjeta a320y1440y se abrieron ambas: texto legible, botón/descarga visibles y sin cortes.
- Cero escrituras del navegador, externas, errores de página o respuestasHTTP>=400.
- Todas las tablasSQLite **también iguales por bytes de celdas crudas durante el recorrido**, digest `7ed34e59d8d80c4d011eb3df3aeeb652fe6603b66329ba5fbc112d294f2b75c6` antes/después. En este intervalo no hubo reinicio ni nuevo cifrado de returnBusy.
- Salud200, identidad original y62registros comprobados al final. El banco y la captura cerraron sus navegadores. CIM limitado a los cuatro PIDs conocidos encontró únicamente22988;19880/31804/2984 cerrados. El servicio actual permanece encendido intencionalmente.

`node --check tools/preview/update-work-summary.mjs` pasa. No se repitieron aquí los8E2E ni tipos de284: constan en la revisión independiente aceptada y este pase comprueba **la instalación servida**. Tampoco se ejecutó toda la suite del repositorio.

## Evidencias y límites

En la raíz288: prepared.json/applied.json, before.json y rollback.json históricos, database-diff.json, preparation-check.json, backup data-before.sqlite; en apply-hIazEP: before.json, backup y recibo/log del servidor. `browser-result.json`, summary-export288.json, continuity-1440/390/320.png y work-summary-320/1440.png completan el pase.

No cambió ZIP271 ni se desplegó. No se probaron proveedores, sesiones corporativas, accesibilidad con lector de pantalla o Edge. No se tocaron4331/4334,App/mainfuente de Claude, sus reservas, sus transportes o sus motores enR2. Zendesk y migraciones siguen internas y devueltas a corrección; multisistema está aceptado como fixture/API y espera montaje. El servicio encendido no implica que un modelo siga ejecutándose al cerrar el chat.

Siguiente: revisión independiente de288 y mantenimiento del recibo vigente; después, cerrar R2 de Zendesk/migraciones por hashes y avanzar Jornada/Radar bajo sus reservas y puertas.
