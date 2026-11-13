# Revisión independiente del montaje 284

8/11/2026, Europe/Madrid. Revisor: este chat Codex; autor: el otro chat Codex. **Dictamen favorable para el montaje presentado.** No acredita actualización de 4601, recuperación duradera A4 ni una nueva comprobación con proveedor.

## Corte y repetición

Se cotejaron los cinco hashes presentados y se reconstruyó la procedencia de las 304 entradas de fuente: backend 277, UI 279, consumidor 255, lector 283, normalización aceptada y las cuatro rutas de código/prueba de 284. El manifiesto coincide con esa composición; no incorpora LocalOperations de A3 en trabajo ni fuentes nuevas de Claude B. Se copiaron los archivos por hash a una raíz propia y se cotejaron de nuevo después de ejecutar.

Evidencia propia: `tests/.tmp/mount284-independent-8zei8z`. El script reproducible es `tests/.tmp/review-mount284.cjs`. Tipos focales de main, Home, Hub y especificación: **exit 0**. Playwright: **8/8 sin reintentos, omisiones ni intermitentes**, 71,41 s. La UI se compiló con React de producción comprobado en el bundle y el servidor se compiló directamente desde main, sin insertar registros de prueba. La clave, base de archivo y puerto 63686 son nuevos y ficticios; se bloqueó la red externa.

El banco comprueba 401 real sin sesión, lectura autorizada con cobertura ausente, una lectura compartida con el Hub, espera al pin exacto, respuesta de otra captura con 91 borradores ficticios, respuesta tardía que ignora AbortSignal después de releer, errores de transporte 401/404/503 y descarga JSON manual. Cada caso conserva el digest de todas las tablas SQLite y exige cero peticiones modificadoras del navegador, cero externas y cero errores de página.

Se abrió la captura final de 320 px: la tarjeta muestra «Sin cobertura: se desconoce», explica que los recuentos no son cero, permite releer y exportar y el pasaporte mantiene desconocido el trabajo no observado. La comprobación automática de desbordamiento y la interacción de teclado pasan. No se hicieron inspecciones nuevas de 390 o 1440 px en esta revisión; el banco usa 1440 para los otros recorridos y la prueba móvil explícita es de 320.

El proceso hijo PID 6448 tiene recibo de cierre por SIGTERM. La consulta CIM posterior, limitada a la raíz propia, no encontró procesos vivos. No se tocó la instalación de 4601.

## Revisión del cambio

main registra una vez `registerWorkSummaryApi` con cobertura falsa, como exige el contrato antes de A4. Home usa el pin publicado por evidencia autorizada, una identidad de propietario y la misma lectura del consumidor 255 para la tarjeta y `extra.work`. Hub mantiene sus invalidaciones completas de copia, conexión y sesión y retira el pin al releer. La cancelación no basta por sí sola: los contadores de consulta/propietario impiden publicar una respuesta anterior.

Una respuesta con otro pin no muestra sus cifras en tarjeta ni pasaporte. La procedencia de archivo describe el soporte del lector; no se convierte en promesa de que los guardados de la App estén instrumentados. No hay botón de recuperación que afirme un montaje A4 inexistente.

Se leyó la corrección de diagnóstico del autor: los dos bancos iniciales 5/8 usaban React de desarrollo porque NODE_ENV=test alcanzaba Vite. Su separación especulativa de identidades fue retirada. El código presentado conserva la identidad original y el banco final fija producción solo al compilar la UI. No se atribuyen aquellos recuentos al comportamiento de producción ni se debilitan las barreras de copia.

## Huellas aceptadas

| Archivo | SHA-256 |
| --- | --- |
| `server/main.ts` | `32461cf8cc0b4de7c984b1bd247d3e5302c57fb5dd10e86bb3c7de33ffe2e365` |
| `src/ContinuityHome.tsx` | `1c0293f0ea2b88e0d6d42b1271b390721b80b9a798b341798c62049f69b22db3` |
| `src/ContinuityHub.tsx` | `a5d8dd797d904e9e1616a2a478053709ddfbea04424f96e091eb0fcb28a2ba1a` |
| `tests/e2e/work-summary-main.spec.ts` | `0f9a5fdff8525559bff46f9a2eee65ebb20afce23bcf997726cfa977b8594c4d` |
| `coordination/reports/CODEX-WORK-SUMMARY-MOUNT-284.md` | `77a981bc093ca2e57534700c0456c2e673b1204ed91cba71964a1c89ff57d2e4` |

## Límites y siguiente paso

Las 16 Node, 22 DOM adicionales y dos mutaciones del informe son evidencia del autor; no se repitieron en este banco. No se ejecutó `npm test` completo. El Kit no está instalado en esta raíz, de modo que no se acredita un ensayo físico de Relevo desde este main. Su ausencia y 404 quedan distinguidos de la evidencia previa 277 con Kit real.

284 se acepta como montaje de código y candidata aislada. La actualización de demo/ZIP requiere su unidad propia con procedencia y datos preservados. La QA de Claude B tiene tres rutas independientes y puede continuar sin editar estos archivos. Jornada, Radar y A4 conservan sus puertas y dueños. Este dictamen se presenta para revisión cruzada, sin autoaceptación.
