# Dictamen independiente 244 · CODEX-EVIDENCE-VIEW-104

6 de noviembre de 2026, Europe/Madrid. **Devolver a `working`.** Conservar reserva. Hallazgo F1 en `src/continuity-evidence-client.ts`, función `checked`. Sin montaje de la vista ni segunda interfaz en Continuidad.

## F1 · El cliente acepta un estado preparado incompatible con los hechos de v1

La guarda de `ready` solo exige que cada check recibido diga `pass`. En v1 el servidor 101 no aporta simulacro de restauración ni tiempo medido y no puede producir `ready` para esos datos. El control parte de una respuesta 200 genuina de 103 con `unproven`, `measuredRecoveryMs: null` y restauración en otro equipo no demostrada. Se conserva el contexto, opciones, procedencia, checks e inventario. Se cambia el veredicto a `ready` y se marcan `pass` los checks. El cliente acepta el resultado. La etiqueta correspondiente en `ContinuityEvidence.tsx` es «Preparado según esta evidencia». La prueba verifica el valor admitido por el cliente. No se presenta como captura de navegador.

Rechazar veredictos incompatibles con el contrato v1. Los datos que algún día puedan sustentar `ready` deben tener un contrato acordado, con evidencia suficiente y versionada. Asegurar que el error retira cualquier resultado previo. Repetir una respuesta genuina y la variante falsificada, y comprobar el mensaje desde el arnés DOM autorizado. La vista sigue pendiente de la evidencia registrada y del enlace de contexto antes de su posible adopción por el Hub.

## Evidencia

- Coinciden 9 huellas de entrega con el tablón y 51 archivos con la proyección histórica final. Las 8 rutas de código, demo y pruebas entregadas coinciden entre ambas proyecciones y checkout. Se cotejó el informe en el checkout.
- 44/44 Node y typecheck focal 0 sobre copia propia. Se conserva el primer intento de carga ESM fallido por ruta Windows y la repetición correcta por CLI de `tsx`. Los 8 DOM históricos corresponden al informe del autor. Esta revisión no los repitió después de obtener la reproducción determinista del defecto.
- Sonda y log en `tests/.tmp/review244-kfO06p/CODEX-EVIDENCE-VIEW-104/independent-244.test.ts` e `independent-review.log`. El control positivo genuino se acepta y el adverso produce `Missing expected rejection (EvidenceReadError)`. Sin cambios en las fuentes presentadas, proveedores, navegador del usuario ni candidata 236.
