# Predeterminados de relaciones al crear tareas desde una ficha

El formulario hereda cada relación por la clave del campo y el tipo de registro. Si no coincide la clave, una relación puede heredarse con otro nombre cuando el origen y el destino tienen un solo campo de ese tipo. Para contar campos también se consideran los de solo lectura. El formulario escribe únicamente en los editables y copia solo identificadores no vacíos.

El acceso desde la ficha requiere una relación directa editable única. Con varios campos capaces de apuntar a esa ficha, la acción se oculta y la creación desde la lista sigue disponible.

## Evidencia

- Las tres regresiones fallan con el helper anterior. Las cuatro pruebas previas pasan en ese control. Con la corrección pasan las 29 pruebas de predeterminados, registros relacionados y selector de referencias.
- TypeScript pasa en el checkout compartido.
- Chromium, con una compilación aislada de la candidata 444 y el helper corregido. La ficha de contacto con tres posibles relaciones directas omite la acción ambigua. La ficha de oportunidad abre el formulario de tarea con oportunidad `deal-1`, contacto `contact-1`, aprobador `contact-2` y observador vacío. El recorrido registra cero errores de página, cero escrituras API y cero accesos externos. Usa datos ficticios y termina el proceso del banco al cerrar.
- Resultado en `tests/.tmp/preset449-jzICJ7/result.json`. Huellas SHA-256 `a9ea9e4360bec67d929ea63b9a8063925db63b513099726284ac54d78ee5a235` (helper) y `237ec6e5e2b5141793442b65a5581d95c65ff995b77a26c6f0f75dd350752e1c` (pruebas).

Alcance de navegador limitado a la preparación del formulario en las fichas de contacto y oportunidad. La prueba se hizo en una instancia temporal.
