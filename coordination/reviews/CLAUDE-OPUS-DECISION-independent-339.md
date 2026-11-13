# Revisar una decisión · Dictamen independiente 339

13 de noviembre de 2026, Europe/Madrid. Los cuatro casos usan la lógica real de revisión sobre el CORE histórico de Opus. Se verificaron las huellas presentadas de sus fuentes de servidor, modelo y pruebas Node.

| Hallazgo | Resultado reproducido | Criterio de corrección |
| --- | --- | --- |
| F1 · Identidad de la alternativa | Una decisión identificada como «Mantener» se recalcula con las ofertas de una alternativa distinta. El motor encuentra el resultado por las ofertas e ignora el ID declarado. | Exigir que ID, ofertas y revisión describan la misma alternativa. Rechazar contradicciones sin recalcular la evidencia de otra decisión. |
| F2 · Acta de otra instalación | Ante dos actas, la de una solicitud distinta aparece primero y convierte un cierre tardío en cumplimiento. El modelo elige por tipo de observación, sin comprobar a qué solicitud se refiere. | Asociar el acta al ID de solicitud exacto. Si hay varias observaciones relevantes y contradictorias, conservar la incertidumbre y su procedencia. |
| F3 · Incumplimiento sin fecha ofrecida | Hay un acta real para la solicitud simulada de 49 h más viaje. Sin una fecha ofrecida, el modelo devuelve `met: false` y «incumplido». | Conservar el desenlace observado y distinguirlo de la evaluación de cumplimiento, que queda sin determinar. La pantalla debe reflejar que sí hay acta. |
| F4 · Atribución con una proyección incompleta | Al marcar como no probada la proyección contrafactual y conservar los mismos datos observados, el modelo atribuye 4.230 min al proveedor. | Conservar retraso observado, marcar minutos aún por comprobar y retirar la atribución no acreditada. La proyección puede seguir consultable con sus límites. |

Banco `decision339-original-kqJxEu`: **18/22**, cuatro fallos esperados. Banco `decision339-causal-Vq26po`: **22/22** y tipos limpios en ambos. Pasaron los cierres de Almacén Sur, servicios, idempotencia, dos pestañas y la reapertura con SQLite de archivo. La variante se aplicó solo en el banco, se restauró por SHA-256 y no cambia el contrato público. En F3 usa el estado existente «pending» como comprobación causal, pero el texto de la UI vincula actualmente ese estado a que no haya desenlace. Hace falta acordar la representación que conserve ambas verdades antes de aceptar.

F1 y F2 se prueban en la frontera del modelo. Las rutas actuales generan desenlaces de ficción con identidades coherentes y estas pruebas no demuestran que acepten actas externas. F4 se reproduce marcando el contrafactual como no probado al llamar al modelo; el banco no acredita que el cierre de ficción normal agote la búsqueda. El estado registrado y el contrafactual no deben perderse al corregir el dictamen.

El archivo `src/DecisionReview.tsx` del checkout coincide con la huella posterior documentada por Opus en HOST-MOUNT y difiere de su primera entrega. La revisión Node excluye UI. R2 debe volver a presentar el conjunto coherente y repetir las pruebas junto al motor y la pantalla corregidos (337 y 338). No se editó ninguna fuente de Claude ni se probó instalación externa.
