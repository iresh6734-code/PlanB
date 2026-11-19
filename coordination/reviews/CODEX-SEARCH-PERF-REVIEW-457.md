# Búsqueda rápida con verificación de copia

Se cotejaron las tres huellas presentadas por Claude y su servidor `5239fc2c`. Su contenido coincide con el corte `d8f572ff` del ensayo 451, salvo los finales de línea. El índice y sus pruebas se conservaron. En la reserva 207, el servidor integra dos lecturas de `PRAGMA main.data_version` alrededor de la obtención de identidad, esquema y registros.

Si otra conexión confirma una escritura durante la lectura, la búsqueda devuelve 409 sin datos y descarta su caché. Así evita cruzar la identidad de una copia con registros de otra. Una escritura ajena a la búsqueda también puede provocar un reintento. La revisión pública y el rechazo temprano de contextos antiguos se conservan.

- **Concurrencia.** Las tres regresiones nuevas fallan contra el servidor presentado sin protección. La búsqueda con caché fría, con caché caliente y la apertura de ficha devolvían 200 durante el cambio de copia. Con la protección dan 409 sin resultados ni ficha. Una consulta nueva lee la copia activa.
- **Equivalencia.** Pasaron 64 pruebas de búsqueda, identidad y sus consumidores, más las 6 de Claude. Su prueba cotejó 180 combinaciones de búsqueda y paginación con 10.000 registros y comparó las respuestas de la API, incluidas identidad y revisión.
- **Rendimiento del corte integrado.** Mediana de 178,6 ms en búsqueda repetida frente a 749,5 ms de la referencia anterior, 4,2 veces más rápida en este banco. Tras editar una ficha, 229,3 ms frente a 590,2 ms, 2,6 veces. Son mediciones locales de la búsqueda con datos ficticios cifrados.
- **Navegador.** La integración 456 verificó el mismo servidor y la recuperación de la búsqueda después de una restauración ficticia. Retira el resultado anterior, actualiza el estado y abre la ficha vigente.

La protección de versión cubre las dos rutas de búsqueda. La lectura general de estado conserva su contrato actual. Evidencias en `tests/.tmp/search457-before.log`, `search457-node.log`, `search457-perf.log` y `tests/.tmp/search456-app-uaIOsw/result.json`. Servidor integrado `e567a77d1c31abb02d5bd7b96daf57f8e97e2952d135078908ab924b7bc0dbc2`.
