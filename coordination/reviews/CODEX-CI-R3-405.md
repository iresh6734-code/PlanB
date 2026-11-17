# Revisión focal de CI R3

Se cotejaron las huellas del tablón con el código, las pruebas y el informe de Claude. En el mismo banco sintético con tsx en la ruta que espera el CLI, pasaron las **20/20** pruebas de `ci-compare` ejecutadas en Windows. La homónima de otro archivo no acredita el resultado de una prueba conocida omitida. El control donde el archivo esperado ejecuta y pasa conserva su clasificación correcta.

En el primer intento dentro del sandbox, el caso que verifica el cierre del árbol alcanzó los 30 segundos y el proceso de prueba no completó el informe. Se repitió ese caso en el entorno local con datos ficticios: pasó en 2,25 segundos. En la suite focal completa volvió a pasar en 2,15 segundos. El resultado del sandbox queda registrado como límite del primer banco.

Aceptación circunscrita a la corrección R3 y a la suite focal. No se atribuye a este resultado una batería completa ni una comprobación canónica verde. El desfase del inventario CSV está documentado en la revisión 403.

Banco `tests/.tmp/inventory402-0c6a52e69cc3464e980693831e3c96f1`, archivos `ci-r3-405-full-local.log`, `ci-r3-405-timeout-local.log` y registro del primer intento `ci-r3-405.log`.
