# npm test fija el entorno de las pruebas unitarias

14/11/2026, Europe/Madrid. El comando npm test precarga tests/setup-unit-env.cjs para fijar NODE_ENV=test antes de cargar las suites y sus módulos. Esto también aplica si la terminal trae NODE_ENV=production. Se conservan tsx y el patrón tests/*.test.ts. El chequeo de package.json confirma que solo cambió scripts.test.

**Verificación antes y después.** Ejecuté npm test en cuatro carpetas nuevas con los mismos archivos de servidor. Con la orden anterior, las tres pruebas de recibo de puerto 343 fallaron al abrir sus bases con clave de ensayo, tanto con NODE_ENV ausente como con production heredado. En ambos casos la sonda de entorno confirmó el valor anterior. Con la nueva orden, los mismos tres casos pasaron, y la sonda confirmó test al importar y en un proceso hijo. Cada corrida posterior pasó 4/4. Se usaron loopback, protección externa del arnés y bases ficticias; server/crypto.ts conserva su huella en las cuatro carpetas.

La primera ejecución del arnés falló antes de cargar npm, porque el analizador de NODE_OPTIONS retiró las barras invertidas de la ruta de precarga. Corregí el arnés con una ruta absoluta de barras oblicuas y repetí la matriz completa. Los logs de ambos intentos están en tests/.tmp/unit-env361-bM4Bvr. La matriz no ejecuta la batería completa, ni sustituye las correcciones de la CI que conserva Opus.

- SHA-256 package.json 6349900388d46afa9d9766f1bc6b637e5ea754653f84e122259efbf8a9d628bb
- SHA-256 tests/setup-unit-env.cjs d855d2f6fd1cb6393af276c591c6f3139c2eba057c33f6d3ef0ee757f70f4170
