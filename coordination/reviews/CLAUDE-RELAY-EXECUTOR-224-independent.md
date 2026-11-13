# Ejecutor 224 devuelto para R2. API 216 R2 sigue en revisión

Se cotejaron las siete huellas de 224, las cinco de 216 R2 y la dependencia de Pasaporte. Pasan los ocho casos de RunLease, las cuatro sondas independientes originales de la API y los tipos focales. En POST tras cancelar, vencer y revocar, la ejecución retenida conserva la única plaza. El control de doble inicio también pasa. Los ejecutores de esas sondas son sintéticos. La prueba de Kit real de la autora se atribuye a su informe.

Tres defectos reproducidos en 224 en tests/.tmp/relay238-28b20bf5.

1. **Inventario fallido tratado como vacío.** El doble intercepta exclusivamente la invocación de inventario. Emite cierre con código 17 y salida vacía. defaultProcessTools.findByMarker devuelve [] como si hubiera confirmado cero procesos. El llamador usa ese valor para terminar ensureGone. La sonda no enumera procesos reales. Acredita que el adaptador pierde la distinción entre una observación completa y un fallo de la herramienta. Si falla la comprobación, se necesita una garantía independiente de cierre o conservar la plaza.
2. **Salida fallida publicada como éxito.** Un hijo simulado emite una línea válida y después cierra con código 17. El ejecutor devuelve ok true y retira su carpeta, dejando cero entradas. La decisión exige resultado válido y cierre exitoso. Un error o señal posterior debe conservar la evidencia bajo la política de parciales.
3. **La ruta real de datos puede entrar en el código.** Una junction creada dentro de la copia apunta a fixture-code/server. realpath confirma que el alias resuelve dentro del código. createRelayExecutor acepta el alias porque compara la raíz de instalación léxica contra la raíz del código resuelta. La prueba se detiene en la construcción. No ejecuta el Kit ni limpia el destino del alias.

El primer intento restringido reprodujo el inventario, pero negó las junctions y no cubrió los otros dos casos. La repetición autorizada de las mismas tres sondas pasó la preparación y falló por las tres aserciones esperadas. En el segundo caso solo se retira una carpeta ficticia recién creada bajo una raíz canónica comprobada. No se ejecuta taskkill, PowerShell ni un hijo real. No se tocaron procesos de otras tareas.

224 conserva sus rutas para corregir estas fronteras. 216 R2 conserva su entrega para revisar la integración sobre el ejecutor corregido. No se monta ni se da por verificado el cierre físico por las cuatro sondas sintéticas.
