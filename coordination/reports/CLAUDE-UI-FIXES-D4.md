# CLAUDE-UI-FIXES-D4 · Arreglos visuales concretos

**Autor:** Claude (Opus 5.5) · **Fecha:** 17/11/2026 · **Origen:** mejora D4 del informe, por orden del usuario. Los archivos compartidos se editaron con su autorización expresa («tómalos y avisa»).

| Defecto (informe) | Arreglo | Archivo |
| --- | --- | --- |
| La ficha enseñaba «Estudio Arce · ID company-1» | El ID interno solo aparece si hay **homónimos**, como ya hacía el selector de clientes. Los mensajes de estado («Relación sin verificar · ID…», «Comprobando la relación elegida · ID…») lo conservan | `src/ReferenceSelect.tsx` (reservado por `CODEX-RELATION-062`) |
| «Comprobar una fecha»: Habilidad cortada («Sistemas VRF (habilitació…») | Los desplegables largos ocupan dos columnas, como Material. Por debajo de 900 px vuelven a una | `src/faro.css` (solo CSS) |
| Hoy en móvil: la banda del Laboratorio cortada con puntos suspensivos | A ≤ 760 px pasa a varias líneas | `src/faro.css` |
| Continuidad: textos de acción cortados en «Preparación de tu Plan B» | Ya no ocurre en el estado actual (lo arregló otra unidad): sin cambio | — |

Para conservar la intención de pruebas de auditoría anteriores se ajustaron 6 expectativas de `tests/independent-interface-contexts.test.ts` (reservado por `CODEX-AUTH-PARENT-RACE-380`). Esperaban «· ID» en registros con nombre único; las de homónimos y las de estado siguen exigiendo el ID.

Huellas finales: `ReferenceSelect.tsx` `6ca3c0e0…a8f3` (antes `9d7a0c18…4b08`) · `independent-interface-contexts.test.ts` `4bce9173…8061` (antes `36718b32…4073`) · `faro.css` `849b0179…b530`.

## Verificación

- `independent-interface-contexts` con `customer-combobox`: **60/60**. `design-tokens`: 10/10.
- En el ensayo aislado, con capturas antes y después (`tests/.tmp/ensayo-1711/shots/d4a` y `d4b`):
  - Habilidad se lee entera a 1366 px;
  - la banda de Hoy a 390 px se lee completa.
  - La detección de recortes (`scrollWidth > clientWidth`) no encontró ninguno en las dos vistas.

## Pendiente

- Cuatro E2E mencionan «· ID»: `reference-select`, `continuity-day`, `hoy-cola-jornada` e `independent-interface-flows`. Hay que revisarlos junto con el resto de E2E afectados por el menú nuevo; no se han ejecutado.
- En Hoy móvil, el botón de recargar sigue ocupando una fila propia. Es un cambio de maquetación de `LocalOperations`, que queda para la pasada de móvil (D5).
