# CLAUDE-WORK-SUMMARY-QA · QA independiente del resumen de trabajo en Continuidad (informe de entrega)

8/11/2026, Europe/Madrid. Claude B. Verificación independiente del montaje **CODEX-WORK-SUMMARY-MOUNT-284** (presentado y aceptado por Codex). No se editó ningún archivo ajeno ni ninguno del producto: los mutantes de control se construyen sobre una copia en `tests/.tmp` (ignorada por git) que la propia prueba borra.

## Presentación y binario exactos
Los archivos del producto que se compilaron son **byte a byte los de la presentación 284** (los hashes coinciden con los del tablón):

| Ruta | sha256 |
| --- | --- |
| server/main.ts | 32461cf8cc0b4de7c984b1bd247d3e5302c57fb5dd10e86bb3c7de33ffe2e365 |
| src/ContinuityHome.tsx | 1c0293f0ea2b88e0d6d42b1271b390721b80b9a798b341798c62049f69b22db3 |
| src/ContinuityHub.tsx | a5d8dd797d904e9e1616a2a478053709ddfbea04424f96e091eb0fcb28a2ba1a |
| src/WorkSummary.tsx | d288662339dfc93a45798d6fb21bf6e22bdf03eeb90b969f585a6a17d0ebc84f |
| src/work-summary-client.ts | e3d61023826f98ada6979f3b6255c24268e970aebddbed43938694b7b2b3281b |
| shared/work-summary.ts | 75bcfdef4adc378247068180f0d5fa28807eb2601cea4000b4c819f86b3d0197 |
| server/work-summary-api.ts | 2809bd6b97bb0d21d94e046b031d7437c11abcdaa512fe7582e8a84960c034c5 |
| src/App.tsx | bacf2aeca8e02822b9153b5459cb1ede6690719e8c7be1b37e15bc3733b1f10b |

Binarios generados en cada ejecución (carpeta nueva fuera del repositorio, un puerto y una base propios, con el bloqueo de red de `block-external.cjs`): **normal** = `server/main.ts` empaquetado con esbuild (sha256 `566d90085e19c2ccf90e2acdf2e248277f5af28c0d75eac51e9dd55de8e4eae7`); **lector** = el mismo `main` con UNA única sustitución de prueba (`covers: () => false` → `covers: () => true`), empaquetado desde la entrada estándar sin escribir nada en el repositorio (`f95feac8b611814d7ca32a0d94d8b54504005edf6d3834e191346592e4e28d4c`). La interfaz es el `vite build` de producción (React sin entorno de desarrollo, comprobado). El `dist` varía de hash entre ejecuciones y no se usa como identidad; se guarda el de cada ejecución en su `evidence.json`.

## Qué se probó y qué NO
- **Instalación «normal»** (el `main` real, `covers: false`): lo que ve una persona hoy.
- **Instalación «lector»** (variante de prueba, `covers: true`, cuaderno sembrado con el **diario real** 208 mediante `tests/work-summary-qa-fixtures.ts`): prueba el LECTOR 283 y su presentación en tarjeta, pasaporte, mapa y exportaciones. **NO acredita cobertura del escritor de la App (A4)**: el escritor sigue sin existir y toda anotación de esas pruebas lo dice (`etiqueta: FIXTURE DEL LECTOR`).
- No se probó el escritor, la recuperación por intento exacto, el montaje de Hoy, un reinicio del cuaderno de otra generación real (la «otra generación» se siembra con una clave de contexto distinta) ni el Kit de relevo (en esta instalación no se empaqueta: el 404 de `/api/v2/relay/rehearsal` es esperado y ajeno al resumen).

## Resultado: 10/10, dos ejecuciones seguidas sin reintentos (≈65 s y ≈75 s)
| Prueba | Qué comprueba | Resultado |
| --- | --- | --- |
| App normal · sin cobertura | Con cuaderno vacío **y** con el cuaderno sembrado (6 entradas + 1 ilegible): respuesta `coverage: none`, `counts: null`, `quarantine: null`; el pin del resumen (`capture:<sha256>`) es el de la evidencia de la copia; tarjeta «Sin cobertura: se desconoce… no es cero»; ni `Sin trabajo local pendiente`, ni «0 borradores», ni recuentos, ni filas `work:*` en el mapa; pasaporte «se desconoce»; **una sola lectura** (`GET work-summary` = 1 al cargar, 2 tras «Leer de nuevo») compartida por tarjeta, pasaporte y mapa; cero escrituras HTTP desde la interfaz; el cuaderno no cambia; dos lecturas directas en reposo no cambian **ninguna** tabla | OK |
| Control causal | Mismo cuaderno vacío, con cobertura declarada → «Sin trabajo local pendiente», fila `work:uncertain` en «Sin incidencia». La diferencia es la declaración de cobertura, no la base vacía | OK |
| Lector · mezcla real | 2 borradores, 1 guardado por comprobar, 1 resuelto, 2 de otra copia (generación e instalación), 1 ilegible → mismas cifras en tarjeta, pasaporte (`1 guardado por comprobar`, pin) y mapa (`work:drafts`, `work:uncertain`, `work:unreadable`); una lectura; **seis descargas** (resumen HTML/JSON, pasaporte HTML/JSON, resumen de turno HTML/JSON): ningún ID de tarea, texto de borrador, clave del diario, ruta, token ni contraseña; JSON del resumen coincide con la respuesta y pesa < 8 KiB; HTML con CSP y sin scripts | OK |
| Lector · situaciones por separado | Seis escenarios (solo borradores, solo inciertos, solo resueltos, solo de otra copia, solo cuarentena, vacío completo): situación, texto, filas del mapa y botones correctos; resueltos/otra copia/vacío = «Sin trabajo local pendiente» y **sin** «Abrir Trabajo por recuperar»; cuarentena **no** es «sin trabajo» | OK |
| Errores | 503 con cuerpo del contrato, 404, JSON inválido, HTML en vez de JSON, fallo de red y pin de otra copia: cada uno se muestra como lo que es; **nunca** conserva los recuentos anteriores (3 borradores) ni los sustituye por cero; el mapa no conserva `work:drafts` | OK |
| Tardía + transporte que ignora `AbortSignal` | Un `fetch` al que se le retira la señal; con la lectura retenida, bloqueo y sesión nueva desde la interfaz: la lectura vieja (7 borradores) no aparece ni en la tarjeta ni en el texto de la página; la sesión nueva hizo su propia lectura. **Control:** sin interrupción, la misma lectura retenida SÍ se ve (7 borradores) | OK |
| Cambio de captura | Reinicio real en el mismo puerto con **otra captura** (otro ID y fecha) y nueva sesión: el pin cambia en la evidencia y en el resumen, los intentos de la captura anterior pasan a «otra copia» (0 borradores), la lectura vieja retenida no vuelve; sin remontar, un resumen con el pin viejo se rechaza («de otra copia y no se muestra como actual»), no lleva recuentos y el pasaporte no lo toma; tras recargar todo se alinea | OK |
| Sesión bloqueada a mitad | 401 en la lectura: se muestra bloqueo y nunca los recuentos previos ni «cero» | OK |
| Navegación | «Abrir Hoy» abre Hoy. «Abrir Trabajo por recuperar» **se ofrece** pero Hoy **no tiene** ese destino: la tarjeta explica que «todavía no tiene ese enlace» y no navega. Ver hallazgo 2 | OK (honesto) |
| Anchos y teclado | 1440, 390 y 320 px sin desbordamiento horizontal ni texto cortado ni botones recortados, objetivos ≥ 24 px (capturas abiertas y revisadas: `resumen-1440/390/320.png` y `pantalla-*.png` en la carpeta de evidencia de la ejecución); orden de tabulación `Abrir Hoy → Abrir Trabajo por recuperar → Leer de nuevo → Descargar este resumen` con foco visible en todos; Enter ejecuta la lectura, abre el resumen descargable y descarga el JSON | OK |

## Control causal de la propia QA (`PLANB_QA_MUTANT=<nombre>`)
Cada mutante rompe UNA cosa del producto en una copia y la suite debe fallar:
| Mutante | Resultado |
| --- | --- |
| `main` declara cobertura sin escritor (`covers: true`) | detectado (App normal) |
| la tarjeta ignora el pin y acredita un resumen de otra copia | detectado (Errores) |
| «sin cobertura» se presenta como «sin trabajo» | detectado (App normal) |
| el pasaporte acepta el resumen de otra copia | detectado (Errores) |
| la exportación filtra una ruta privada | detectado (Lector · mezcla) |
| se retira la guarda de generación de la tarjeta | **sobrevive, y es un mutante equivalente en la App**: la tarjeta se desmonta al bloquear/cambiar de copia y el padre descarta por propietario, de modo que una lectura vieja nunca puede mostrarse; la guarda es defensa en profundidad no alcanzable desde la interfaz (no hay forma de solapar dos lecturas: «Leer de nuevo» se deshabilita mientras carga). Se cubre con la prueba de componente de 255, no con esta |

## Hallazgos (se devuelven al dueño; no se corrigió nada ajeno)
1. **Mensaje impreciso entre superficies** (bajo, UX; dueño: Codex coordinador del montaje 284 con `shared/impact-map.ts`/pasaporte de Claude B 214/215). Con cobertura ninguna la tarjeta dice «Sin cobertura: se desconoce», pero el pasaporte y la fila `work` del mapa dicen «No se pudo leer el cuaderno de trabajo local». Las dos expresan «desconocido, no es cero» y no se confunde con vacío, pero la causa (no hay escritor frente a fallo de lectura) se pierde porque `toWorkSource` convierte «sin cobertura» en `unavailable`. Propuesta: pasar la cobertura al origen `work` del pasaporte y distinguir el texto. Es una unidad nueva en mis archivos (214/215) cuando Codex lo pida.
2. **Botón «Abrir Trabajo por recuperar» sin destino** (bajo, honesto; dueño: Claude A + Codex coordinador, fila «Hoy → Trabajo por recuperar» del inventario). `ContinuityHome` no pasa `onOpenRecoverable` y Hoy no tiene ese contexto: el botón aparece con trabajo pendiente y responde con una explicación. Es correcto como mensaje, pero **no debe presentarse como integración funcional**; conviene ocultarlo hasta que exista el destino (o rotularlo «aún no disponible»).
3. **Fila de cuarentena oculta por defecto** (informativo): `work:unreadable` está en un grupo plegado del mapa; la tarjeta sí la muestra visible. Sin acción requerida.
4. **`installId` abreviado en el pasaporte** (informativo): los JSON/HTML del pasaporte llevan la forma corta de la identidad de la instalación (diseño de 214); el resumen de trabajo no la lleva. No es una fuga de datos privados; se anota por si Codex quiere excluirla de exportaciones compartibles.
5. **Estado de la interfaz tras un cambio de copia en el servidor** (informativo): un `POST /api/import/snapshot` con `replace` sobre una copia activa no cambia la captura activa; la copia solo cambia de verdad al reiniciar o activar otra. La prueba usa el reinicio real.

## Estado de llegada
| Qué | Estado | Tarea / dueño |
| --- | --- | --- |
| Tarjeta + pasaporte + mapa con una lectura y pin | **En la App** (284 aceptado) y comprobado aquí sobre sus bytes | Codex |
| «Sin cobertura» antes de A4 | **Comprobado en la App** | Codex |
| Cobertura real (escritor A4) | **No existe**; los escenarios con cobertura son fixtures del lector | Claude A (A4) + Codex |
| Navegación a «Trabajo por recuperar» | **No existe**; el botón explica | Claude A / Codex |
| Esta QA | Pruebas internas reutilizables (`tests/e2e/work-summary-qa.spec.ts`, `tests/work-summary-qa-fixtures.ts`) | Claude B |

## Cómo repetirla
`npx playwright test tests/e2e/work-summary-qa.spec.ts` con el navegador headless-shell de Playwright (`PLANB_PLAYWRIGHT_EXECUTABLE`) y una configuración sin `webServer` (la mía: `tests/.tmp/claude-b-run/pw.config.ts`). Cada ejecución construye todo en una carpeta temporal nueva, usa puertos libres propios y no toca `4601` ni procesos ajenos. Mutantes: `PLANB_QA_MUTANT=cobertura-declarada|pin-ignorado|sin-generacion|sin-cobertura-es-vacio|pasaporte-toma-otra-copia|exportacion-con-ruta`.

## Hashes finales (sha256)
| Ruta | sha256 |
| --- | --- |
| tests/e2e/work-summary-qa.spec.ts | 31a01106f3d10edc14c9822a646db2d4ec5fc498c34de5df31ca14f996f6bb64 |
| tests/work-summary-qa-fixtures.ts | 7c55ba14204c9616327f3f6b0b69f692b198e6dc81fb9075ffdeb128f8ad4312 |
| coordination/reports/CLAUDE-WORK-SUMMARY-QA.md | (este informe) |
