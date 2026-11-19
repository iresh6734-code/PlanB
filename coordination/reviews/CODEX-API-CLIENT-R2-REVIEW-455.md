# Revisión independiente de rutas del cliente R2

Las dos huellas presentadas coinciden. La batería R2 pasa 5/5 y cubre las tres regresiones de 433. El árbol sintáctico reconoce las comillas, las concatenaciones multilínea y los sufijos fijos.

Queda un falso positivo con una rama literal dentro de un fragmento dinámico. En una copia temporal de `src/Protection.tsx`, sustituí solo la rama de configuración de `'/v2/auth/'+(setup?'setup':'login')` por `ruta-ausente-455`. El inventario contiene login y setup. La batería volvió a dar 5/5, aunque una de las dos direcciones posibles ya no existe. La condición se convierte en un comodín y una sola coincidencia basta para aprobar el conjunto.

R3 debe contrastar por separado las ramas que se pueden resolver estáticamente. Los fragmentos genuinamente dinámicos siguen siendo diagnósticos de cobertura. Conservar los tres casos de 433 y añadir la reproducción con una rama válida y otra ausente. Las dos direcciones documentadas deben seguir funcionando.

El banco `tests/.tmp/api455-7ce5f4ebceb14e01a9255fef3457a141` contiene `result.json`, `exact.log` y `variant.log`. La modificación existe exclusivamente en la copia de prueba. El trabajo se limitó al inventario de direcciones y a la seguridad de su regresión funcional.
