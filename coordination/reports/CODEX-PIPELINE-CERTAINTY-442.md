# Alcance de «Oportunidades abiertas»

Inicio separa tres datos. Una etapa que no está en la configuración queda «por revisar» y su registro no entra en lo abierto. Un importe ausente queda sin valorar y el cero registrado se sigue contando. Si la consulta devuelve un subconjunto, la tarjeta muestra cuántas oportunidades se leyeron y cuántas hay, también si ninguna de las leídas está abierta.

La tarjeta muestra un subtotal etiquetado como importe conocido si faltan datos y permite reintentar una lectura fallida. Las consultas se limitan a los primeros 100 registros de la copia local. El resultado queda vinculado al esquema y la revisión usados para solicitarlo. Al cambiar el esquema, se retiran los totales anteriores aunque coincidan hora y recuento. Una respuesta atrasada no reemplaza la vista nueva.

## Verificación

- Chromium pasa 5/5 sobre el componente real montado con datos ficticios y GET interceptados. Cubre importes y etapas, un caso de ausencia total de importes, subtotal sin abiertas, reintento sobre 503 y cambio entre dos copias con revisión reutilizada. La respuesta anterior se entrega de forma deliberada en el último control aunque el transporte ignore abort.
- Las mismas cinco pruebas fallan sobre el código previo congelado en `tests/.tmp/qa441-2DRBJw/source`. El primer corte mostraba cuatro abiertas y 6.200 € en el caso que ahora distingue tres abiertas y 1.200 € conocidos. También mostraba 0 € con todos los importes ausentes y carecía de reintento.
- TypeScript del checkout terminó con código 0.

Entradas y logs de navegador en `tests/.tmp/pipeline442-*`. El alcance es la tarjeta de Inicio. La instalación no se usó en esta entrega.
