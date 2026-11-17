# Voz de la interfaz de Plan B

Glosario para quien escriba textos de la App (mejora D2 del informe; `CLAUDE-UI-COPY-D2`, 17/11/2026). La persona que usa Plan B es la responsable de una pyme, no quien lo programa. La regla es decir lo que significa para ella, no cómo está hecho por dentro.

| Usar | En lugar de | Por qué |
| --- | --- | --- |
| **datos de prueba** | ficción, ensayo · ficción, datos de ensayo, local · ensayo | Un solo nombre para lo inventado: el menú ya lo llama así («Con datos de prueba») |
| **sin comprobar** | sin demostrar | Dice lo que falta hacer, no un estado abstracto |
| **copia** / **copia activa** | captura activa, snapshot | La captura es el acto de copiar; con lo que se trabaja es con la copia |
| **la copia cambió** | el contexto cambió, pin, revisión de contexto | Los identificadores internos no se enseñan |
| **Propuestas** | Agentes | Es lo que la persona ve y decide: propuestas que revisar |
| **Laboratorio** | Operaciones (para Radar y Comprobar una fecha) | Solo funcionan con datos de prueba |
| **Bloquear** | Proteger / bloquear | Una acción, un verbo |
| **ID** solo con homónimos | «Nombre · ID x» siempre | El identificador interno solo sirve para distinguir dos registros con el mismo nombre |

## Reglas

- Un error dice **qué pasó**, **que los datos siguen en el ordenador** (si es así) y **qué hacer**, con un botón cuando se pueda reintentar (`ErrorState` en `src/ui`).
- No se enseñan identificadores internos ni nombres de unidades del tablón (A4, 318, pin, revisión).
- Lo inventado se marca siempre como «datos de prueba», en el mismo sitio y con la misma palabra.

`tests/ui-copy.test.ts` comprueba que los términos retirados no vuelven a los textos visibles de `src/`.
