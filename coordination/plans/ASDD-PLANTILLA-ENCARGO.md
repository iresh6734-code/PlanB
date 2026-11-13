# Plantilla de encargo y entrega con aceptación demostrable (ASDD)

Encargo: `CLAUDE-ASDD-PLANTILLA-250`. Propuesta de proceso redactada el 6/11/2026 a petición del usuario. **No está adoptada ni probada en un encargo real.** Solo Codex puede decidir adoptarla; hacerlo exige un encargo aparte que reserve `AGENTS.md`, `COORDINACION.md` o los JSON de tareas. Este documento no cambia la herramienta del tablón.

## Origen y límites de la fuente

La idea parte del vídeo «Cómo hacer que una IA construya el proyecto que tú quieres» (Eric Risco, 2026), que describe «Agent Spec Driven Development». Del vídeo se tomó el problema: un agente con un objetivo largo y la métrica «que pasen los tests» rellenó los huecos de la spec con decisiones propias, por ejemplo añadió un QR de autenticación que nadie pidió. El artículo de Anthropic que el autor cita **no se ha leído**; lo que aquí se atribuye a Anthropic es solo lo que el autor resume. Lo demás es una adaptación a este tablón.

## Qué ya cubre el tablón y qué añade esto

Ya existen: reserva de archivos exactos (`claim`, `check-path`), revisión independiente por Codex, `submit` con hashes, pruebas en la App compilada con datos ficticios y `CONTEXTO-PROYECTO.md` como memoria. Se añade solo lo siguiente:

1. Criterios de aceptación como pares acción → resultado observable, al inicio del encargo.
2. Lista de **decisiones reservadas** que el agente no toma solo.
3. Regla por riesgo para hallazgos y desvíos.
4. **Registro de supuestos** obligatorio en cada `submit`.
5. Revisión de cada unidad por un revisor de contexto limpio antes de presentar.
6. Control obligatorio no ejecutado = visible y bloquea el cierre.

## 1. Estructura del encargo

Cada encargo nuevo (`coordination/briefs/*.md` o el campo `plan`/`acceptance` del JSON) incluye:

| Sección | Contenido | Pregunta que responde |
| --- | --- | --- |
| Objetivo | Una frase de resultado para la persona usuaria | ¿Para qué? |
| Acciones de la persona | Acción, condición de partida y permisos necesarios | ¿Qué puede hacer y quién? |
| Criterios de aceptación | Lista de «Si… entonces se observa… y no ocurre…» | ¿Cómo sé que funciona? |
| Debe respetar | Contratos, comportamientos y decisiones anteriores que siguen valiendo, con referencia a `CONTEXTO-PROYECTO.md` o al encargo | ¿Qué no puedo romper? |
| Decisiones reservadas | Cosas que el agente debe parar y consultar (ver §3) | ¿Qué no decido yo? |
| Alcance | Archivos exactos de escritura y de lectura | ¿Dónde puedo tocar? |
| Evidencia exigida | Comando, prueba o recorrido y el artefacto que quedará | ¿Cómo lo demuestro? |
| Fuera de alcance | Lo que parece relacionado pero no se hace | ¿Qué NO hago? |

### Cómo escribir un criterio de aceptación

- Forma: **acción → resultado observable → efecto que no debe ocurrir.**
- Observable significa que lo puede ver otra persona sin leer el código: respuesta HTTP, texto en pantalla, fila en SQLite, recuento de peticiones, bytes de un archivo.
- Para interfaz: indicar viewport (1440, 390, 320), teclado y foco.
- Para API: estado, cuerpo mínimo y qué base queda intacta.
- «Pasan los tests» **nunca** es un criterio por sí solo. Un test es un medio para demostrar un criterio, no el criterio.

Ejemplo de criterio bien formado: «Si se interrumpe el proceso después de persistir y antes de despachar, al arrancar con la misma base, Trabajo por recuperar muestra el intento exacto y se observan cero PATCH».

## 2. Cuando el encargo tiene huecos

Si algo no está en el encargo, el agente **no lo rellena**. Lo registra en la lista de supuestos (§4) con una de estas tres salidas:

- **Trivial y reversible** (nombre interno, orden de imports, texto de un mensaje de error sin efecto en contratos): decide, aplica y anota en el registro.
- **Con efecto observable** (nuevo paso para la persona, nuevo campo, nueva dependencia, nueva pantalla): para esa unidad y lo declara con `block` o lo deja como pregunta abierta en el `submit`. Sigue con otra unidad independiente.
- **De riesgo reservado** (ver §3): no se implementa, aunque «sea más seguro».

La seguridad no es excusa para ampliar el comportamiento. Un agente puede proponer un endurecimiento; no lo aplica sin que el encargo lo pida.

## 3. Regla por riesgo y decisiones reservadas

| Nivel | Ejemplos en Plan B | Qué hace el agente |
| --- | --- | --- |
| Bajo | Texto, estilos, refactor interno sin cambio de contrato, prueba adicional | Aplica, lo anota en el registro de supuestos |
| Medio | Cambio de comportamiento visible, nuevo estado de interfaz, orden o filtros, límites de tamaño o tiempo | Aplica solo si el criterio de aceptación lo cubre; si no, pregunta antes |
| Alto | Contratos y esquema común, migraciones, dependencias, `package.json` y lockfile, autenticación y autorización, protección de datos, conexiones externas, borrado o sobrescritura de trabajo ajeno | No actúa. `block` con nota y espera a Codex o al usuario |

Decisiones reservadas por defecto en todo encargo, salvo que el encargo diga expresamente lo contrario:

- Cambiar o retirar un método de autenticación o conexión.
- Añadir un paso a un flujo de la persona usuaria (p. ej. un segundo factor, un QR, un diálogo extra).
- Omitir un requisito por considerarlo inseguro, costoso o ambiguo.
- Tocar archivos fuera de la reserva o modificar contratos comunes.
- Crear datos de ejemplo en la app o declarar verificada una conexión que no se ha probado.

## 4. Registro de supuestos (obligatorio en `submit`)

La nota de `submit` y el informe de la entrega incluyen un bloque con estos cuatro apartados. Si un apartado no tiene nada, se escribe «ninguno»; **un apartado omitido hace la entrega incompleta**.

```
SUPUESTOS Y DESVÍOS
1. Supuestos tomados: qué no estaba en el encargo y qué decidí. Nivel (bajo/medio).
2. Requisitos no cumplidos o reducidos: cuáles, por qué, qué falta.
3. Añadido que no se pidió: qué es, por qué, dónde está, cómo se quita.
4. Preguntas abiertas para Codex/usuario: qué decisión necesito y qué bloquea.
```

Codex revisa primero este bloque. Si el apartado 3 no está vacío, decide mantener, retirar o convertirlo en encargo propio antes de aceptar.

## 5. Revisión durante la implementación

Por cada unidad acotada, antes de `submit`:

1. **Implementar y autocomprobar** contra los criterios del §1 y dejar la evidencia exigida.
2. **Revisión de contexto limpio.** Un subagente que no ha visto el razonamiento de la implementación lee el cambio y su entorno inmediato y busca: errores lógicos, problemas de seguridad, efectos en otras partes, y **comportamientos añadidos que el encargo no menciona**. Recibe el encargo y el diff, no la conversación.
3. **Verificar los hallazgos.** Cada hallazgo se contrasta con el código real, se eliminan duplicados y se ordenan por gravedad. Un hallazgo sin comprobar no se trata como error confirmado.
4. **Corregir o descartar con justificación**, y registrarlo en el §4.
5. **Controles obligatorios.** Compilación, pruebas relevantes, comprobación de seguridad aplicable y el recorrido de aceptación. Un control obligatorio que falla impide presentar. Un control que **no se ejecutó** se declara en el `submit`; no se presenta como superado.
6. Presentar con `submit`. La revisión de Codex es independiente y no sustituye a este paso.

Esto añade trabajo por unidad. Para cambios pequeños (bajo riesgo, un archivo, sin comportamiento visible) basta con los pasos 1, 5 y 6.

## 6. Después de integrar

Cuando Codex acepta e integra, comprobar el cambio junto con la versión principal: observar el comportamiento y anotar cómo se recupera el estado anterior si falla. Los resultados van al registro de `CONTEXTO-PROYECTO.md` por quien coordina, no por este proceso.

## 7. Ejemplo aplicado: un tramo de `CLAUDE-HOY-TRABAJO-RECUPERABLE-240`

El encargo 240, apartado A4, ya contiene criterios fuertes y cortes de proceso. Reescrito con esta plantilla quedaría así (resumen, no sustituye al encargo):

- **Acciones de la persona:** tras reiniciar, abrir «Trabajo por recuperar», elegir un intento y verificarlo leyendo. Permiso: lector autorizado de esa copia.
- **Criterios:**
  - Si el proceso muere después de aplicar y antes del acuse, al arrancar con la misma base el intento aparece como incierto, con acción de verificar por lectura, y no se observa ningún PATCH.
  - Si la persistencia falla antes de habilitar el despacho, se conserva el borrador, se informa del fallo y se observan cero PATCH.
  - Un arranque, recarga o reintento de lectura no produce escrituras.
- **Decisiones reservadas:** no cambiar el contrato público hacia Claude B; no añadir confirmaciones nuevas al reenvío más allá de la acción explícita pedida; no persistir IDs de tarea ni contenido de borradores en el resumen público.
- **Registro de supuestos esperado:** por ejemplo, «Elegí un identificador de intento con prefijo X (bajo)», «No se pudo probar el corte Y con SQLite de archivo, falta la barrera determinista (control no ejecutado)».

## 8. Límites de esta propuesta

- Es proceso, no control técnico: el tablón no impide que un agente ignore esta plantilla, igual que no impide editar fuera de la reserva.
- No se ha medido si reduce supuestos no pedidos o retrabajo. Hay que probarla en uno o dos encargos y comparar el apartado 3 del §4 antes y después.
- La revisión de contexto limpio consume tiempo y cuota. Conviene reservarla para riesgo medio o alto.
- El vídeo describe un experimento personal de su autor, no una práctica contrastada.

## 9. Cómo probarla (siguiente paso sugerido)

1. Codex elige un encargo nuevo de tamaño medio.
2. Se redacta con las secciones del §1 y las decisiones reservadas del §3.
3. El agente entrega con el bloque del §4.
4. Codex anota cuántos supuestos o añadidos sin pedir aparecieron y si la plantilla ayudó o estorbó.
5. Con ese resultado se decide adoptarla, ajustarla o descartarla.
