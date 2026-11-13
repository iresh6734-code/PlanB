# UX032 · Segunda revisión independiente

Dictamen vigente, **30/10/2026, 09:51 Europe/Madrid: UX032 aceptada como done** tras revisión de la regresión corregida, sensibilidad y11 hashes. El registro del29/10 siguiente explica la devolución previa; queda sustituido por el cierre al final de este informe. Fuentes de Claude sin edición por Codex.

29/10/2026, Europe/Madrid. Revisión anterior: corrección funcional comprobada en arnés; faltaba corregir la regresión persistida antes de aceptar.

## Comprobaciones propias

- Hashes actuales de todos los archivos reservados iguales a la presentación del tablón al revisar.
- Fuente `CustomerCombobox.tsx`: `openRaw && !disabled` oculta la lista inmediatamente; efecto cierra/limpia; `choose` y quitar bloquean con disabled. Sin modificación de permisos del consumidor.
- Ejecutadas **73/73** comprobaciones: 13 del componente en copia temporal y 60 `ui-journeys` del árbol actual. Copia en `tests/.tmp/lab035/combobox-review.test.ts`, con `PLANB_UI_SRC` fijado al src actual solo en el proceso hijo; red externa bloqueada. Se añadió antes de deshabilitar `c.click()` y `assert.equal(c.options().length, 3)`.
- Typecheck del árbol actual correcto durante LAB035. No repetidos Chromium/E2E ni lector de pantalla: los 5 E2E de la segunda entrega siguen atribuidos al autor.

## Laguna de la nueva prueba

La prueba titulada «al deshabilitarse con la lista abierta» monta el componente cerrado y llama directamente a `c.render({ disabled: true })`. No abre la lista. Por tanto no reproduce la precondición que causó la devolución original y puede pasar si se retira la corrección.

El cambio de código funciona con la precondición real, como prueba la copia temporal. Para conservar la protección, se devuelve exclusivamente la prueba: abrir la lista, afirmar las tres opciones antes de deshabilitar y mantener las comprobaciones de cierre, ninguna selección y rehabilitación sin reapertura antigua. Comprobar que el caso falla con la versión defectuosa en una copia aislada, sin mutar archivos compartidos. No es necesario repetir las 32 E2E por rutina.

## Atribución y estado

Revisión de `src/CustomerCombobox.tsx` SHA-256 `7a0fc238348477639c5926f2c85e113ca1e4df2db1766a17e1ec3c12ce0d243a`; test `9cb35c8d903ff3fae32158e9ebbad548231961238c057f24217cfdb32ab00542`. Tras `revise`, UX032 permanece working y conserva reservas; no se acepta ni despliega. La herramienta registra la corrección; no acredita que Claude haya leído el aviso o siga ejecutándose. Este informe nuevo queda en LAB035 para revisión, sin autoaceptación.

## Cierre propio de R2 · 30/10/2026

El usuario trasladó la entrega de Claude y su autorización de traspaso a otra sesión. Se cotejó el estado real del tablón: UX032 review y los11 archivos iguales a su presentación. Solo el test y el informe cambian frente a la fuente antes revisada; componente, consumidor, CSS y E2E conservan sus hashes.

La prueba nº13 ahora abre con c.click() y afirma tres opciones y aria-expanded=true antes de disabled:true. Conserva lista oculta, cero opciones, ninguna selección/quitar y habilitación sin reapertura, seguida de una nueva selección válida. No se debilitó la aserción de cierre.

Validación independiente sobre snapshot nuevo `tests/.tmp/ux032-r2-review-a70e0c20-a95a-4e9d-bb27-4baf56d2f693`:

- **73/73 reales**:13 combobox y60 ui-journeys, sinTODO/skips; PLANB_UI_SRC ligado al src congelado, bloqueo de red externa.
- **Sensibilidad12/13**: solo en mutant-src se retira la condición !disabled del open efectivo y el efecto de cierre. Falla únicamente la prueba nº13, en «deshabilitado oculta la lista». No se alteró la fuente compartida ni el test para fabricar el fallo.
- **Typecheck completo del snapshot correcto.** Resultados y logs real.log/mutant.log/typecheck.log con hashes de fuentes en manifest.json y resultados en results.json.
- No se repitieron navegador/build: el delta es de test/informe; los recorridos previos de REL046 se conservan como evidencia fechada sobre el mismo componente, no se atribuyen como ejecución nueva. El arnés de hooks no acredita React DOM/StrictMode o lector de pantalla.

Test aceptado SHA-256 `96c7da8f9a9debacf42aecc5cb0e3fc0dbb59cc5ef325711cbe7fe22ee55c2e0`; componente `7a0fc238348477639c5926f2c85e113ca1e4df2db1766a17e1ec3c12ce0d243a`. Antes de accept se recotejaron los11 hashes contra presentación y las fuentes probadas. **UX032done, reserva liberada por aceptación legítima**, sin tomarla como otro autor.

Las cuatro dependencias de OPS048 están done y no hay reservas activas en sus seis archivos al corte. OPS048 permanece ready, sin claim por Codex: una única sesión Claude puede reservarla y seguir el brief existente. No significa que ya esté ejecutándose, que haya sido instalada la candidata o que se hayan cerrado REL033 y las revisiones ajenas. No despliegue, proveedores, commit o push.
