# Dictamen independiente 254 · Evidencia de continuidad

6 de noviembre de 2026, Europe/Madrid. Favorable a `CODEX-EVIDENCE-101` R2, `CODEX-EVIDENCE-API-103` R3 y `CODEX-EVIDENCE-VIEW-104` R2, por ese orden. Se cotejaron las 5, 4 y 9 huellas presentadas con el checkout. Las rutas de código, demo y pruebas ejecutadas coinciden también con la proyección propia. Se verificaron las dependencias aceptadas 201 y 245, incluidas las identidades de `shared/drill-evidence.ts` y el guard en `server/security.ts` usados en el corte.

| Entrega | Hallazgo reproducido al sustituir únicamente las fuentes anteriores | Resultado sobre los bytes corregidos |
| --- | --- | --- |
| 101 R2 | Cinco repeticiones de una comprobación hacían subir `declaredPassed` de 1 a 2. | Solo cuentan las cinco identidades distintas y aprobadas. Pasa el control con etiquetas reordenadas, sustitución, duplicación, fallo técnico y legado sin entorno. Se mantienen informes guardados, vínculo limitado a identificador y recuperación sin medir. |
| 103 R3 | La sesión que vencía al leer por segunda vez `instanceId` recibía 200 y el siguiente GET devolvía 401. | 401 sin hechos ni cookie tanto al vencer durante el cálculo como durante la última lectura de identidad. Si además cambia la identidad, 401 prevalece. Con sesión válida y pin obsoleto, 409. Pasan los controles de instancia ajena, archivo incoherente y seis tablas intactas. |
| 104 R2 | El cliente admitía `ready` fabricado con checks en `pass`, sin tiempo de recuperación medido. | V1 rechaza ese veredicto. Chromium muestra evidencia genuina, retira el resultado al recibir la variante falsa, muestra el aviso y recupera el resultado genuino tras la siguiente consulta explícita. |

## Evidencia reproducible

- Corte propio `tests/.tmp/review254-U52OfG`. `review-manifest.json` contiene huellas de las tres entregas y de los tres archivos sustituidos para el contraste. `before-node.log` contiene tres fallos por las aserciones esperadas, sin errores de infraestructura. `after-node-final.log` contiene **95/95** y cero skips. Incluye bancos de servicio, API, cliente, SSR, guard, motor y cola, y las sondas previas 244/252. Typecheck focal exit 0.
- **9/9 Chromium** en `after-browser.log`, Playwright local con Chromium existente y una fixture nueva servida en `127.0.0.1:4519` por el arnés, sin acceso exterior. La suite acredita teclado, foco, cancelación, contexto y geometría a 1440, 390 y 320 px. Se abrió `shots/invalid-ready.png` y se comprobó el aviso sin un resultado anterior visible. El caso genuino comprueba título, contenido visible, consola de página y solicitudes. Vite avisó de anotaciones en Zod y tamaño del bundle. El proceso de Playwright terminó después del cierre del arnés.
- La primera proyección no incluía el CLI histórico de 101. Se añadió para cotejarlo. Las dos primeras ejecuciones del banco conjunto fallaron solo en SSR por resolver JSX sin `tsconfig.json` en la raíz del corte. Se copió la configuración canónica del arnés original y se repitieron las mismas aserciones sin alterar las fuentes.

Los dictámenes acreditan las piezas. 239 debe registrar el endpoint en el servidor principal y repetir contra el ejecutable. 242 conserva su prueba de vínculo a la copia activa. El montaje privado 239 que acompaña a la entrega se atribuye al autor. No se tocó App, `main`, memoria, proveedor ni candidata 236 durante esta revisión.
