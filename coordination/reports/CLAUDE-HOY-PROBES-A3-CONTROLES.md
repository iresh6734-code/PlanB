# CLAUDE-HOY-PROBES-A3-CONTROLES · controles del arnés 240 tras montar la Jornada

Autor: Claude A. Dos archivos: `tests/e2e/hoy-recuperable-240.spec.ts` y este informe. No toca producto ni `hoy-recuperable-harness.ts`.

## Qué cambia

- **Control legado sustituido.** «Hoy NO lee la cola estructurada (línea base de A3)» pasa a «Hoy… lee la cola estructurada **UNA vez** al abrirse y no escribe nada»: sondea `workQueueReads === 1` y `attempts === 0`. Era rojo por diseño tras `CLAUDE-HOY-COLA-JORNADA-A3`.
- **Sondas A3 → controles.** Las dos sondas A3 (lectura de la cola y entrada «Organizar mi jornada» + Jornada de continuidad) pasan sin cambiar su cuerpo y se renombran `CONTROL A3 · …`.
- **Sondas A2 → controles** (`CONTROL A2 · …`): ya pasaban desde A2/Por decidir aceptados; solo cambia el rótulo.
- **Sondas A4 intactas** (diario duradero y resumen público): siguen rojas por función ausente, que es su papel de referencia causal.
- **Fin de línea:** el archivo estaba en CRLF; se normaliza a LF (aprobado por la persona para mis unidades). Los cambios de contenido son solo los de arriba.

## Antes y después (mismo arnés, raíz nueva por ejecución, sin reintentos)

| Momento | Pasan | Fallan |
| --- | --- | --- |
| Tras montar A3, antes de esta unidad | 12 | 3 (control legado «Hoy no lee la cola» + 2 A4) |
| Con esta unidad, tres ejecuciones seguidas | **13/15** (1,1 / 1,2 / 1,1 min) | **2**, ambas sondas A4, por «FUNCIÓN AUSENTE: superficie «Trabajo por recuperar»…» y por la ruta del resumen sin montar |

## Huella

| Archivo | SHA-256 (LF) |
| --- | --- |
| `tests/e2e/hoy-recuperable-240.spec.ts` | `84f6ee07058463c65fd77754cdd92049b1259f74a0cb125c0ece98511cf7479c` |

## Límites

Las sondas A4 no se tocan hasta que exista el contrato (véase `A4-DURABLE-RECOVERY-HTTP-PROPOSAL.md`, propuesta sin acordar). Una sonda que pasa no acredita la función fuera del arnés: el recorrido con `main` compilado sigue siendo la prueba de salida.
