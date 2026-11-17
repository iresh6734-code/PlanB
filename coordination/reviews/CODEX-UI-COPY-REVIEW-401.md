# Revisión de la regla de vocabulario D2

Cotejé las tres huellas presentadas. En el checkout la prueba de vocabulario pasó 2/2. En un banco aislado ejecuté esa misma prueba con un solo archivo TSX sintético, variando la forma de expresar la misma palabra retirada.

| Escritura del texto en TSX | Resultado |
| --- | --- |
| Texto visible con el término actual | Aprobado, control correcto |
| Texto directo con «ficción» | Rechazado |
| Expresión JSX con literal entre comillas simples | Rechazado |
| Expresión JSX con literal entre comillas dobles | Aprobado por error |
| Expresión JSX con literal de plantilla | Aprobado por error |
| Nombre accesible en `aria-label` entre comillas dobles | Aprobado por error |

Banco `tests/.tmp/copy401-fc93b58f7a404fa08ded8da4c04fdcc9`. Cada resultado proviene de un proceso Node independiente con el detector exacto. El primer lanzamiento del banco falló al resolver un import absoluto de Windows. La repetición usó el soporte nativo de TypeScript de Node 24 y produjo los controles de la tabla. No se editaron componentes ni se ejecutaron E2E de D2.

Para R2, comprobar esas formas de texto e incluir casos de regresión para las tres omisiones. El alcance puede mantenerse en el test y el informe. Conservar casos que excluyan rutas e identificadores. Los textos actuales y los E2E pendientes siguen con el alcance documentado por la autora.
