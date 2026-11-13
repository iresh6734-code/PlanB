# 298 · Consulta local del historial de lecturas

8/11/2026, Europe/Madrid. API interna opt-in de solo GET para el diario297 aceptado. No modifica main/App, no guarda configuración o autorización y no monta una función visible. No consume SourceStatus en corrección ni llama a un proveedor. Primera versión únicamente para copia y fuentes ficticias identificadas.

El anfitrión debe inyectar una función síncrona local y de solo lectura que fije instancia/contexto, proveedor, cuenta, objeto, modo y objetivo autorizados, junto con su revisión de ámbito. No hay valor por defecto que autorice todas las cuentas. La query solo selecciona dentro de ese ámbito; copiar una cuenta o cursor del cliente nunca concede permiso. El futuro registro central de consentimiento sigue siendo responsabilidad del coordinador, no de esta función de ejemplo.

Cada GET conserva la autorización de sesión original y exige el pin de contexto completo. Comprueba contexto y ámbito antes y después de consultar el diario; un callback local fallido o incompatible no expone resultados. No se admiten callbacks asíncronos ni red en la resolución del ámbito. El cursor es estado de paginación, no credencial: ligado a instancia, contexto, fuente exacta, revisión de ámbito, revisión del diario y tamaño de página. Cambiar cualquiera invalida la continuación. Una revisión diferente produce conflicto, no una lista mezclada.

La respuesta lleva únicamente recibos, hashes, tiempos originales, cobertura, causa y recuentos locales; nunca etiquetas, asuntos, referencias externas, valores o cuerpos de registros. Un fallo sin datos conserva recuento null. Cero recibos significa que no hay una lectura guardada para ese filtro; no significa que el proveedor esté vacío. No declara connected ni provider-observed y recuerda que es historial local de ensayo. Corrupción o lectura fallida se distinguen de un historial vacío. No hay alta automática, reparación, pruning, renovación de fechas o método de escritura. Respuestas y errores no se almacenan en caché.

## Llegada pendiente a la app

| Unidad sucesora | Dueño | Alcance propuesto y puerta |
| --- | --- | --- |
| Registro local de fuente/consentimiento y ámbito del anfitrión | Codex coordinador del otro chat | Archivos nuevos del registro; requiere SourceStatus corregida/aceptada. No lo sustituye el binding fijo ficticio de las pruebas. |
| Consumidor «Historial de lecturas» | Claude B, bajo encargo futuro | src/SourceReadingHistory.tsx, cliente/estilos y pruebas nuevos, tras aceptar298 y acordar API. Consulta solo local, descarta respuestas tardías y no ofrece Conectar/Leer proveedor por esta unidad. |
| Montaje desde Integraciones y API en servidor principal | Codex coordinador, reservas futuras | App/main o contenedor real correspondiente; depende de consumidor aceptado y registro de ámbito. No modificar esos archivos bajo298. |
| Recorrido de aceptación de producto | Codex con QA de Claude B | Desde navegación habitual, cuenta ficticia correcta, paginación y cambio de ámbito, bloqueo, reinicio y1440/390/320. Solo entonces se declara visible. |

Las filas anteriores son un plan de montaje pendiente, no reservas o implementaciones ya existentes. El login y ensayo HubSpot del otro chat permanecen separados; no se accede a su navegador, terminal o credenciales. Esta consulta no habilita coberturaA4 ni una lectura externa.
