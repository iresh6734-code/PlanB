# QA052 y QA056 en el corte actual

Repetición de las tres suites independientes originales con las expectativas vigentes y sin editar sus archivos. Se congelaron las fuentes, se cotejó el SHA-256 del constructor contra la presentación de REL046 y se ejecutó el banco de empaquetado con esa copia exacta. El argumento existente `QA056_SCRIPT` sustituyó la huella histórica que el banco espera en ejecución por defecto. Se conservaron todas sus aserciones de comportamiento.

| Área | Resultado | Control principal |
| --- | --- | --- |
| Restauración e integridad | 20/20 | F1: envíos en curso se convierten en inciertos al restaurar o reiniciar. El plan no los reenvía y el caso original de QA052 pasa. |
| Cobertura de copias | 12/12 | La cobertura conserva los controles de alcance, orden y estado. Una copia restaurada con envío convertido en incierto se distingue de la original. |
| Constructor de candidata | 20/20 | F2: activos públicos de extensiones variadas, mayúsculas y archivos sin extensión cotejados. F3: las variables ficticias arbitrarias no llegan a los hijos observados y los seis bundles usan el ejecutor saneado. |

Las pruebas de constructor usaron proyectos sintéticos. Validaron junctions de directorio y declararon sin verificar los enlaces simbólicos de archivo, que no pudieron crearse en este Windows (`EPERM` en el control). La rama equivalente de los verificadores de copia conserva ese límite. No se afirma que toda rama de enlaces pasara.

El primer corte del arnés preparó el banco de empaquetado correctamente. Las otras dos suites fallaron por falta del directorio temporal que requieren dentro de su copia. Se preparó una carpeta nueva con ese directorio y se repitieron esas dos suites. No se suman resultados de ambos intentos. 

Bancos `tests/.tmp/qa441-2DRBJw` (constructor) y `tests/.tmp/qa441-MWKdda` (restauración y cobertura), con huellas, resultados y límites de entorno. No hubo despliegue ni se usó la instalación.
