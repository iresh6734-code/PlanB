# Dictamen independiente 258 · Ejecutor de relevo 224 R2

6 de noviembre de 2026, Europe/Madrid. **Favorable.** Las siete huellas presentadas coinciden con el checkout y las cinco fuentes/pruebas ejecutables con la proyección propia. Se cotejaron también las cinco huellas de 216 R2 y las dependencias aceptadas de Kit 116 y pasaporte 214. Las correcciones de 224 quedan verificadas por separado del dictamen de autorización de 216.

## Cierre físico y reproducción causal

- Las tres sondas independientes de 238 fallan por su causa sobre el ejecutor R1 preservado. Un inventario que termina con error se trataba como cero procesos, una línea válida seguida por exit 17 se publicaba como éxito y borraba el rastro, y una junction al código se admitía como raíz de datos.
- Las tres pasan sobre R2. Inventario fallido queda desconocido, su fallo mantenido conserva la plaza y el estado `unverified` hasta obtener un inventario válido. Exit 17 o señal no acreditan éxito y conservan marca parcial. La raíz se decide por destino real, se rechazan alias y una sustitución posterior no permite barrer un destino ajeno.
- **40/40** en una pasada serial del ejecutor, ranura, API y siete sondas independientes previas. Incluye **Kit real completo** con un create, cero duplicados, conciliación y destino abierto en otro proceso. Se repitió cancelar con el destino abierto, esperar el cierre de todo el árbol y comprobar cero procesos al liberar la plaza. La ejecución retenida tras cancelación, timeout y revocación conserva el máximo de un trabajador. También pasan los rechazos de doble inicio, los temporizadores y el cierre acotado del servidor.
- Typecheck focal limpio. Se ejecutó Windows con dependencias existentes y red externa bloqueada, en una raíz ficticia propia. Las pruebas de errores de inventario y códigos de salida usan dobles. El ciclo y la cancelación del Kit usan sus procesos reales y comprueban su ausencia. POSIX no se repitió.

Evidencia en `tests/.tmp/review258-ervnfl`, manifiesto, `before.log`, `after-rerun.log` y `types.log`. Las junctions no estaban permitidas en la primera preparación restringida. La copia se completó con el permiso correspondiente. La primera invocación del banco usó una ruta de preload sin `./` y terminó antes de cargar pruebas. Se corrigió la invocación y se repitió el banco sobre las mismas fuentes.

La API de 216 todavía necesita el control final de sesión descrito en su dictamen R2. El estado público de cierre y el paquete 254 deben acreditar su montaje. Esta aceptación acredita el ejecutor y su ranura, sin afirmar disponibilidad en la candidata servida ni recuperación de una copia activa en otro equipo.
