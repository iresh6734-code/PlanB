# Encargo111 · Recuperación persistida resistente

1/11/2026, Europe/Madrid. Ejecuta Codex, sin subagentes. Autorización de alcance nueva para F1–F3 confirmados en la revisión108 de QA091.

La reserva055 conserva exactamente `server/store.ts`, `server/recovery.ts`, su prueba histórica y su informe. Se ha devuelto a working para corregir esos dos archivos y actualizar su informe; su prueba de incertidumbre permanece intacta.111 reserva solo este brief, `tests/persisted-recovery-resilience.test.ts` y su informe nuevo. No se duplican reservas ni se acepta055 para liberar archivos.

- F1: migración de cifrado omite exclusivamente la fila recoveryPlan inválida, preservando bytes y permitiendo diagnóstico R1. Plan válido/nulo conserva migración normal; JSON inválido de otros datos sigue rechazado, sin silenciar corrupción.
- F2: registro local inexistente produce AppError controlado en aprobación y antes de iniciar aplicación; se relee al usarlo después de esperas. No se inventa una ficha o se cambia el plan para poder continuar.
- F3: respuesta de creación debe ser cadena no vacía antes de asignar ID/mapa. Si hubo efecto remoto con respuesta malformada, conservar incertidumbre sin reintentar, relacionar o verificar con ID inventado. No convertir a Number/String para arreglar la respuesta. Validar estructura del plan dentro de la transacción, antes de escribir mapa o plan.

Oráculos: filas SQL/bytes propios, reaperturas repetidas y API legible, casos positivo/negativo, IDs opacos/0/grandes exactos, conteo de efectos remotos y ausencia de repetición. Fixtures nuevas con clave kind:test explícita antes de abrir Store de disco, sin DPAPI. Ensayar tests propios y tres reproducciones QA091 copiadas sin TODO, dejando sus archivos compartidos intactos. Cotejar baseline108 y registrar sensibilidad causal, regresión de incertidumbre original, R1 y generación109.

No App/Claude/contratos globales/demos instaladas/proveedores/build raíz/dependencias/commit/push/despliegue. Mantener055/111enreview al presentar, sin autoaceptarlas. El motor035 solo se abre para memoria documental al terminar; sin regularizar036.
