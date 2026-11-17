# 380 · La prueba de apertura verifica el bloqueo en curso

16/11/2026, Europe/Madrid. El fallo G6 de la batería 377 comparaba por expresión regular la línea que entrega `done` a Protection. El código actual espera la lectura y también comprueba que la solicitud siga vigente. La expresión antigua exigía que `setAuth('open')` apareciera inmediatamente después de `await refresh()`, por lo que rechazaba esa comprobación adicional.

G6 ejecuta ahora el App real con el arnés ya usado por AUTH_PARENT072. Inicia una apertura, retiene la lectura, emite el aviso de bloqueo y deja pendiente la comprobación del acceso. En ese intervalo entrega una respuesta de estado válida de la apertura anterior. App rechaza esa promesa y conserva la protección. Al confirmar el bloqueo, una apertura nueva sí funciona con su propia lectura. También verifica que la pantalla de acceso se vuelva a montar ante el aviso. Los hijos y el transporte están simulados y la prueba no depende del formato del JSX.

| Comprobación | Resultado |
| --- | --- |
| G6 sobre App congelado actual | 1/1 |
| G6 sobre App de la candidata 377 | 1/1 |
| Control en una copia de App sin la comprobación de vigencia | 0/1. La promesa antigua se resuelve y la prueba exige que se rechace |
| Suites de apertura y contextos | 51/51 |
| Typecheck del corte congelado | Limpio |

El primer arnés devolvía nulo al pedir la fecha de captura en la pantalla posterior a abrir. Se reutilizó `describeCapture` y se repitió el banco. La misma función real da forma a la fecha con o sin captura. Se preservaron los cuatro casos de AUTH_PARENT072 en su suite y se reusaron sus hooks simulados para el caso de carrera. El ajuste corrige el falso fallo G6 del corte 377. La batería global completa posterior a este cambio sigue pendiente.

Banco final `tests/.tmp/auth380-Hhthhr`. SHA-256 de App comprobado: `37ee4ea8d799e1d5acc8396142b17672cbc7506210c913f2f260a7c38223e351`. Se repuso App en la copia tras el control y se conservó la fuente del checkout. Esta entrega cambia pruebas. Los datos son ficticios y la evidencia corresponde al arnés de Node.

## R2 · Cotejo después de D4 · 17/11/2026, Europe/Madrid

Se comparó la versión presentada de la suite de contextos con la huella D4. Las diferencias quitan el sufijo visible de ID en las expectativas de nombres únicos y conservan los valores del selector, el ID de los homónimos y los estados pendientes y de error. La regresión G6 no cambia. Se conserva la edición D4 y se presenta la huella cotejada, 4bce9173c2e53f6c2f2cdc4618446826d51e32be3010e72f19feed2014948061.

Con el App congelado de la candidata 395, ambas suites pasaron 51/51. En una copia temporal que solo retira la comprobación de vigencia de la apertura, G6 falló con «Missing expected rejection». El arnés y los archivos de producto no se editaron. La comprobación de navegador de otros escenarios de autenticación queda fuera de esta repetición.
**App verificado:** 81c9ef8aa662a296827727366520b54440ccc10d7ffb712585c4ce375a431c80. Evidencia: D:\AI\Plan-B-CRM-v2.1\source\tests\.tmp\portable395-707197439bcd455e84a6458851d901a3.


## R3 · Arnés con la lista de registros real · 17/11/2026, Europe/Madrid

Se conserva la edición autorizada del arnés que carga el módulo real de la lista con los mismos React y transporte simulados. Su SHA-256 verificado es `029c5e7be34781f9677ec2bef84d33989f13263d5860b1b1de6b47c6285d0f59`. Se cotejaron desde el inicio y al final las dos suites, App y el hook de lista con la candidata f992ac95-6466-42a0-bb7c-1b1fa2993e35.

Las suites pasan **51/51** y typecheck pasa. G6 también pasa de forma aislada y falla con «Missing expected rejection» al retirar la guarda de vigencia en la copia temporal. El cambio se quitó de la copia antes de repetir las dos suites. La evidencia está en el banco `tests/.tmp/auth408-zSbeBw` en cuatro registros y `results.json`. Esta repetición reúne la huella del arnés con las dos suites y no modifica el producto.
