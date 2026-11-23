# Plan B 0.3.0 · Plan de entrega y piloto

Objetivo: que una agencia prepare un Plan B en un PC Windows del cliente, demuestre trabajo local y recuperación, y opere un portal de producción exclusivamente en lectura. Un operador, un portal por carpeta y hasta 10.000 registros. Esta versión es candidata a piloto, no una disponibilidad general acreditada.

## Construido en esta versión

- Clasificación persistente de ensayo/producción y compatibilidad con copias anteriores.
- Contrato de producción STANDARD, consentimiento explícito y selección de campos antes de capturar. Contraseña local previa y vinculación a un portal.
- Transporte de lectura que impide altas, modificaciones, relaciones y borrados aunque la credencial tenga más permisos.
- Recorrido guiado: proteger, conectar, capturar, probar cada copia, exportar y confirmar custodia externa. Confirmar custodia no sustituye una restauración.
- Recuperación manual: contrastar valores y relaciones por lectura, mapear altas sin duplicar IDs y conservar informe con sesión/captura/revisión. Un archivo descargado nunca cierra pendientes.
- Cifrado obligatorio para exportar/restaurar copias reales, IA bloqueada para datos reales y diagnóstico sin fichas ni secretos.
- Iniciador Windows que abre el navegador, detecta la misma instalación abierta y conserva log acotado. Runtime independiente sin conectores.
- Ensayo: reanudar relaciones de un alta incierta sin crearla otra vez y verificar su lectura final.

## Puertas de aceptación

1. Compilación, pruebas de contrato, escritorio y móvil con datos sintéticos. Evidencias y resultado final en CONTEXTO-PROYECTO.md.
2. ZIP Windows: ejecución del Node incluido, DPAPI, reinicio/traslado, restauración cifrada y rechazo de contraseña errónea. Hashes inmutables; evidencias junto a los ZIP.
3. Iniciador de ambos paquetes y segundo arranque de la misma carpeta. Edge queda pendiente si no hay ejecutable disponible.
4. Devolución auténtica de ensayo: ejecutar el alcance de ENSAYO-RETORNO-v0.3.0.md únicamente tras revisar permiso de escritura. Las pruebas de mocks no la sustituyen.
5. Aceptación autónoma: una persona ajena al desarrollo sigue LEEME-v0.3.0.md sin terminal, restaura una copia y completa un ejercicio cronometrado. Meta propuesta: preparación en 30 min y recuperación en 15 min; registrar tiempos observados sin inventarlos.
6. Primer piloto real: agencia/cliente identificados, autorización y condiciones revisadas, PC designado, clave de lectura propia y plan de custodia/soporte. No se conecta ningún portal real durante el desarrollo.

## Alcance comercial del piloto

Oferta previa a validar: 199 EUR de preparación + 59 EUR/mes por portal. No hay ventas ni SLA acreditados. Buscar primero una agencia y un cliente adecuados; no abrir cinco líneas de producto a la vez.

La agencia realiza alta, alcance, simulacro inicial, custodia y acompañamiento de retorno manual. El cliente conserva el PC encendido para capturas, protege contraseñas y practica restauraciones. Antes de tratar datos reales deben concretarse responsables, tratamiento, retención, soporte, condiciones y autorización; estos documentos de trabajo no sustituyen su revisión profesional.

## Sin ampliar en esta versión

Sin multiusuario, otros CRM, facturación, IA con datos reales, servicio Windows, alertas remotas, campañas, adjuntos ni escritura automática de producción. No publicar ni actualizar instalaciones anteriores para entregar esta candidata.

## Registro del piloto (rellenar con evidencia)

- Agencia/cliente: pendiente; no guardar datos personales en este archivo.
- Versión/hash utilizado: pendiente de aceptación del paquete.
- Tiempo de preparación/restauración: no medido.
- Simulacro/copia/custodia: pendiente de operador humano.
- Incidencias y decisión continuar/corregir/parar: pendiente.
