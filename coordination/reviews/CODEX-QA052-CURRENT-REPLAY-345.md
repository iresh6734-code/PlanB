# Repetición de QA052 sobre las fuentes de recuperación y el constructor vigentes

13 de noviembre de 2026, Europe/Madrid. Banco tests/.tmp/replay345-drg1Fk. Se cotejaron 227 archivos de la candidata 340 y sus copias. El único cambio de origen en ese inventario es server/endpoint.ts (343), que las suites no ejercitan. Los cinco archivos de pruebas y los auxiliares de recuperación, selección, entorno y tablón conservan sus bytes.

| Banco | Resultado | Alcance |
| --- | --- | --- |
| Recuperación y cobertura de Claude | 32/32 | F1 en restauración y reinicio, envío en vuelo como incierto, controles sin reenvío y cobertura de copia. |
| Constructor de Claude | 20/20 | F2/F3, bytes públicos, exclusiones, entorno de los hijos, fallos de compilación, cambios durante la captura y límites. |
| ASSETS057 | 4/4 | Activos opacos y entorno. Junction pública rota rechazada antes de los checks. |
| Selección de Claude | 15/15 | Selección de fuentes, reglas de capitalización, declaraciones de exclusión y tratamiento de enlaces de directorio. |

El banco del constructor usa QA056_SCRIPT para probar 9719765673729c44cad2318969995d22e5506d968ab4e2efe586d46a0b292731. El oráculo de huella histórica ae74ce22… informa el modo alternativo. El controlador cotejó por separado la huella vigente con la entrega REL046, la copia de 340 y los bytes ejecutados. ASSETS057 coincide con su entrega. Los TAP de recuperación y del constructor contienen diagnósticos de enlaces simbólicos de archivo no disponibles. Las ramas correspondientes terminaron antes de sus aserciones de enlace sin incrementar el contador de omisiones de Node. Sí se ejercitaron las junctions.

Los dos intentos de preparación anteriores quedan en el banco: el import de tsx mediante ruta absoluta de Windows era inválido y luego faltó el auxiliar core.mjs en la copia. Se corrigió el arnés local y se conservaron los TAP. No se alteraron los oráculos ni se repitieron las 32 pruebas de recuperación tras completar el módulo del tablón, ajeno a esas dos suites.

QA052 y QA086 siguen aceptadas como auditorías. La evidencia cubre los hallazgos F1, F2 y F3 en las fuentes cotejadas y no incluye una nueva compilación de toda la app. REL046 y ASSETS057 quedan en revisión. No se cambió código de producto ni se ejecutó una entrega instalada.

Se cotejó la huella del informe de mejoras de Opus preparado para Gemini. El documento distingue su typecheck de la ejecución de la app. Su propuesta G4 sobre conciliar cambios externos a las reservas es pertinente para los montajes actuales. La siguiente unidad puede entregar un informe de reconciliación con las huellas que han cambiado, sus reservas y los responsables. El informe de Opus sigue presentado en el tablón.
