# CLAUDE-UX-032 · Selector accesible de clientes (R12)

Agente: claude. Una sola sesión, sin subagentes. Sin commit, push, despliegue, instalación ni acceso a proveedores. No se tocó `tools/releases` (CODEX-REL-033), memoria, panel ni archivos de Codex.

## Qué cambia

- **`src/CustomerCombobox.tsx` (nuevo)**: combobox reutilizable (patrón ARIA 1.2 con lista). Props `label, contacts, value, onChange(id), disabled?, limit=50`.
  - `role=combobox` con `aria-expanded`, `aria-controls` (solo abierto), `aria-activedescendant`, `aria-autocomplete=list`; lista `role=listbox` con `role=option` y `aria-selected` en el elegido.
  - **Escribir solo filtra**: nunca llama a `onChange`. Elegir exige Enter sobre la opción activa o un clic. Búsqueda sin acentos ni mayúsculas, por nombre, correo o teléfono (reutiliza `contactLabel`/`filterContacts` sin editarlos).
  - ArrowDown/ArrowUp (abren y se detienen en los extremos), Enter, Escape (restaura el texto y no se propaga, para no cerrar ficha/diálogo padre), Tab (cierra sin elegir), blur cierra. Botón «Quitar el cliente de «…»» con foco devuelto al campo.
  - **Homónimos**: si `contactLabel` se repite, se añade ` · ID <id>`. Cada opción lleva `data-contact-id` y se elige por ID.
  - Estados: sin clientes, «Ningún cliente coincide con «…»…», tope visible «Se muestran N de M coincidencias…», y región viva `aria-live=polite` con el recuento.
  - **Selección ausente**: si el ID ya no está en la fuente se muestra `role=alert` + `aria-invalid`, no se sustituye por otro cliente.
- **`src/customer-combobox.css` (nuevo)**: objetivos táctiles de 44 px, lista con altura máxima, sin desbordamiento a 320 px.
- **`src/CommercialWorkspace.tsx`**: se retira el `ContactSelect` nativo interno y se usa `CustomerCombobox` en «Cliente del seguimiento» y «Cliente para los documentos». La selección sigue siendo un único estado compartido entre pestañas. `contactId` efectivo = `contact` solo si existe en la lista actual; con una selección ausente no se habilita preparar, ni HubSpot, ni Archivos, y `prepare()` sale antes de enviar nada.
- **Pruebas**:
  - `tests/customer-combobox.test.ts` (nuevo, 12): ARIA, escribir no elige, búsqueda por acento/mayúsculas/teléfono/correo, Enter/flechas con topes, Escape, Tab/blur, clic por ID con homónimos, estados vacío/sin resultados/tope, quitar, selección ausente, deshabilitado, región viva.
  - `tests/ui-journeys.test.ts`: `ContactSelect` → `CustomerCombobox` en 7 sitios (sin quitar aserciones) y 4 pruebas nuevas (preparar exige elegir por ID; selección ausente no habilita preparar/HubSpot/Archivos; selección compartida entre pestañas y borrador sucio conservado; lector no puede preparar).
  - `tests/e2e/{v6,customers,ux,session-lock}.spec.ts`: `selectOption('contact-1')` → helper `pickCustomer(page,label,id)` (abre el combobox y hace clic en la opción por `data-contact-id`). 5 sustituciones; **ninguna aserción eliminada ni relajada**.
  - `tests/e2e/customer-combobox.spec.ts` (nuevo, 4): teclado/Escape/Tab/quitar sin tráfico externo; homónimos elegidos por ID y el POST lleva `contactId==='gemela-2'`; 1.200 contactos → 50 opciones + tope visible, afinar lo quita, mensaje sin resultados; selección compartida con Archivos, sin desbordamiento, lista dentro de pantalla y opciones ≥44 px a 1440/390/320 (capturas generadas y revisadas a 1440 y 320).

## Un fallo propio encontrado y corregido

En la primera ejecución completa fallaron 5 E2E antiguos: mi región viva usaba `role=status`, y las aserciones existentes `getByRole('status')` pasaron a tener 2 coincidencias (violación de modo estricto). No se tocaron esas aserciones: la región viva ahora es `aria-live="polite"` sin `role=status`, y la prueba del componente se adaptó. Tras ello, 32/32.

## Comandos y resultados reales

Todo sobre datos y build temporales aislados en `tests/.tmp/e2e-run` (puertos 4337/4341, `scripts/block-external.cjs`, Chromium headless de Playwright, un trabajador). No se usó `npm run build` ni las instalaciones 4331/4334. Como `TeamApp.tsx`, `TeamAgentWorkspace.tsx`, `HubspotContext.tsx`, `App.tsx` y `server/team/oauth.ts` tienen cambios sin integrar de Codex, el build aislado se hizo con una copia temporal donde esos cinco archivos están en HEAD (copia ya borrada).

| Comando | Resultado |
|---|---|
| `npx tsx --test tests/customer-combobox.test.ts` | 12/12 |
| `npx playwright test --config tests/.tmp/e2e-run/pw.config.ts v6 customers files ux v3 v4 v5 continuity session-lock customer-combobox` (con datos limpios) | **32/32** (1,9 min). Antes de la corrección: 27/32 por el `role=status` descrito |
| `npx tsc --noEmit -p .` | sin errores |
| `npm test` (`tsx --test tests/*.test.ts`) | 620/620, 0 fallos (incluye pruebas aún sin integrar de Codex en el árbol de trabajo) |
| Mutaciones sobre archivos reales con restauración (9) | 8 detectadas; sobrevive «flechas sin tope» (equivalente: el render ya acota el índice activo) |

## Límites

- Las pruebas del componente usan el arnés de ranuras de hooks de Node, no React DOM: comprueban atributos y lógica, no el DOM real. El DOM real se cubre solo con el E2E de Chromium.
- No se probó con lector de pantalla real; la accesibilidad se verifica por roles/atributos y por teclado en Chromium, no por la experiencia auditiva.
- Solo Chromium headless; no se probó Edge, Firefox ni Safari.
- La nueva vista «Empresa» de Codex (`TeamApp.tsx` sin integrar) no se ejecutó con este selector: se probó contra la versión HEAD. Conviene repetir los E2E de Comercial cuando Codex integre su cambio.
- El tope es de 50 opciones pintadas; con miles de contactos hay que afinar escribiendo (no hay virtualización). Se probó con 1.200.
- Las capturas en `tests/.tmp/e2e-run/results` son temporales y no se incluyen en el encargo.

## Hashes SHA-256 (estado entregado)

```
a32d8b32097f5ddc016856bb3820d824672869d583998ea44cad476138d926e4  src/CustomerCombobox.tsx
e350adb16fb61e93e0b2e8f6c9b3d875f285ca34aa2825514c145d4758a68d46  src/customer-combobox.css
0230198c9ac6bdbe5cecb9978d0757041bbfd6567537c0d8189445c070c38a49  src/CommercialWorkspace.tsx
8c58da8f9340d7d3369146fba8bd26ffd10e1a6106fc7550308a70c906f8b438  tests/customer-combobox.test.ts
d93a6cc174d18088d373fc5d7b9139fc970883436786eeb6b99737d2ec94701a  tests/ui-journeys.test.ts
e94254a30266c5d97218634fad346705d76ff983681fe71f49bbb469e7608f85  tests/e2e/customer-combobox.spec.ts
57c3aea8ae54e45525d987c8f392ff91e89c78234ceed84a244f394d39d1859b  tests/e2e/v6.spec.ts
55a36bf00ec903e8576f7d879e875197e9dd049b56a8f76bff354005110b4f3f  tests/e2e/customers.spec.ts
93401b594eab3147a4de468a8bf439d16a51967b3d2a8b05de83886d47ce02d3  tests/e2e/ux.spec.ts
53c5319d7f571119821290b784b6ade644ecd6ecf8c9ebaccc1c95d233deedde  tests/e2e/session-lock.spec.ts
```

(El informe no se incluye en su propia lista de hashes.) Sin commit ni push. Queda a la espera de la revisión de Codex; no acepto mi propia entrega.

## Segunda entrega: corrección de la revisión de Codex (P2)

Hallazgo aceptado: con la lista abierta, pasar `disabled` a `true` dejaba las opciones y `choose` activos (`onChange(c2)`).

- **Corrección en `CustomerCombobox.tsx`**: `open` efectivo = `openRaw && !disabled` (la lista, `aria-expanded`, `aria-controls` y `aria-activedescendant` dependen de él); un efecto cierra y limpia la consulta al deshabilitar, así que al habilitar de nuevo no reaparece la lista antigua; `choose` y «Quitar» ignoran la llamada si `disabled`.
- **Regresión nueva** en `tests/customer-combobox.test.ts` (13.ª prueba): abrir con valor c1 → deshabilitar → sin lista, sin opciones, `aria-expanded=false`, sin botón quitar, sin `onChange`; habilitar → no reaparece; una apertura nueva elige c2 con normalidad. Un clic rezagado con el cierre de render anterior no es realista en React (el manejador se sustituye), por eso la prueba comprueba que no queda ninguna opción clicable y el bloqueo en `choose` queda como defensa adicional.
- **Resultados**: `tsc` sin errores; `tests/customer-combobox.test.ts` + `tests/ui-journeys.test.ts` 73/73 (13 + 60).
- **Cierra el límite señalado por Codex**: esta vez el build aislado (`tests/.tmp/e2e-run/full`) se compiló del árbol de trabajo actual, **con** la vista «Empresa» y demás cambios de Codex sin integrar. `customer-combobox.spec.ts` (4) y `company-home.spec.ts` (1) pasan 5/5 con datos temporales y sin red externa. No repetí los 32 E2E antiguos: varios asumen la pestaña inicial anterior a «Empresa» y no son aplicables a ese árbol.
- Siguen sin cubrirse React DOM/StrictMode, lector de pantalla real ni otros navegadores.

Hashes nuevos: `src/CustomerCombobox.tsx` 7a0fc238348477639c5926f2c85e113ca1e4df2db1766a17e1ec3c12ce0d243a · `tests/customer-combobox.test.ts` 9cb35c8d903ff3fae32158e9ebbad548231961238c057f24217cfdb32ab00542. Los demás archivos no cambian respecto a la primera entrega.

## R2 · corrección de la prueba nº13 (30/10/2026)

Traspaso de la reserva UX032 a esta sesión por indicación expresa del usuario. Solo se modificó `tests/customer-combobox.test.ts`: antes de `disabled:true` la prueba hace `c.click()` y afirma 3 opciones y `aria-expanded=true`; después conserva lista cerrada, ninguna selección y habilitación sin reapertura.

- Real: 13/13. Copia efímera con el defecto (`open = openRaw`, sin efecto de cierre; scratch, PLANB_UI_SRC): 12/13, falla la nº13. Typecheck sin errores.
- SHA-256 test `96c7da8f9a9debacf42aecc5cb0e3fc0dbb59cc5ef325711cbe7fe22ee55c2e0`; `src/CustomerCombobox.tsx` sin cambios `7a0fc238348477639c5926f2c85e113ca1e4df2db1766a17e1ec3c12ce0d243a`.
- No se repitieron E2E. Sin despliegue ni autoaceptación.
