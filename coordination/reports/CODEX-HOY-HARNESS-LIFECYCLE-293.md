# 293 · Cierre del arnés por identidad del hijo

8/11/2026, Europe/Madrid. Entrega presentada para revisión independiente. Tres rutas exclusivas; no modifica App/main, fuentes de Claude ni aserciones E2E de producto.

## Problema y cambio

El arnés consultaba `process.kill(pid, 0)` después de observar el cierre del hijo. En Windows el PID puede pertenecer ya a otro proceso y producir un falso «sigue vivo». La autora lo comunicó en la normalización EOL; aquí se reproduce de forma determinista simulando únicamente esa observación de señal cero, sin tocar un proceso ajeno.

Ahora cada spawn conserva su ChildProcess original, promesa de close y recibo correspondiente. `assertAllClosed` exige ese recibo original dentro del registro público y comprueba el estado del mismo handle. Un recibo inventado con el mismo PID no lo satisface. Incluye hijos que terminaron antes de LISTEN; no limita el control a los arranques exitosos. No sondea PIDs cerrados ni omite la comprobación de hijos activos.

`stop` espera close incluso si exit ya ocurrió. `restart` coteja handles y cierre anterior, admitiendo que el sistema reutilice PID o puerto. Se impide que otro start sustituya el seguimiento de un hijo aún pendiente. El destino del recibo de cierre se captura al arrancar, de modo que cambiar de caso no lo redirija. Formatos públicos de StartReceipt/CloseReceipt conservados. Las pruebas de producto existentes que esperan un PID distinto no se alteraron.

## Comprobaciones propias

Banco `tests/.tmp/harness293-JSz2EZ`, script `tests/.tmp/verify-harness293.cjs`. Corte aceptado 288 verificado contra las huellas de su recibo; solo se superponen el arnés y la prueba 293. Vite compila esa copia privada. Los servidores son reales, sobre SQLite ficticia y puertos aleatorios locales; no se inicia navegador.

- **7/7 Node** en 28,31 s: un padre y seis controles de servidor activo/doble start, recibo inventado, PID reutilizado, ausencia del recibo original, reinicio con datos conservados y exit previo a LISTEN. Sin omisiones, cancelaciones ni reintentos internos.
- Tipos focales del test y dependencias: exit 0.
- La versión anterior completa se reconstruye a LF desde el corte 290 y coincide con el baseline aceptado `29e5ad13310521bfa3ef6cef2d69d1990a61bd546ef73a35905382038c9e7752`. En una copia privada, la sonda de PID reutilizado falla 0/1 con `AssertionError: ... sigue vivo tras su cierre`, después de cerrar realmente el servidor. La misma aserción pasa en la prueba nueva. Se restaura el arnés privado y se coteja su huella y la del checkout.
- Fuentes base cotejadas; `postcheck.json` verifica también que la configuración runtime corresponde exactamente a las opciones explícitas. CIM posterior limitado al banco: ningún proceso vivo.

No se repite toda la batería de navegador: esta entrega no cambia el producto. Los 16/17 de Jornada comunicados por Claude siguen siendo un resultado histórico de aquel banco. Sus defectos R2 de contexto, y los de la interfaz del Radar, continúan en sus unidades propias. La demo 4601 respondió 200/ready durante esta tarea y no se actualizó; su endpoint compacto omite registros por contrato, por lo que esa lectura no acredita un recuento nuevo.

## Huellas

| Archivo | SHA-256 |
| --- | --- |
| `tests/e2e/hoy-recuperable-harness.ts` | `8e071e2be3336eca4c0661b7b71ae8ff1bf737a15a5d5ac51b392d9020439d17` |
| `tests/hoy-harness-lifecycle.test.ts` | `1109da4fbf303f2b14a2bf390c3027ab9e60b8cc82f177b30533838941668d19` |

El tablón registra la huella de este informe al presentar. Sin instalación de dependencias, build/dist raíz, acceso al original corporativo, proveedor, despliegue o commit.
