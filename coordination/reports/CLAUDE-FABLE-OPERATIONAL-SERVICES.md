# CLAUDE-FABLE-OPERATIONAL-SERVICES · Gemelo operativo, cuarta puerta

10/11/2026, Europe/Madrid. Autor: Claude (arnés: `claude-fable-5-2`). Pedido por el usuario el 10/11. Solo archivos nuevos.

## Resumen

Un segundo caso de negocio de ficción, un estudio de servicios y proyectos, funciona con el mismo contrato y el mismo motor que la instaladora, sin editar ni bifurcar ningún módulo del núcleo. **Esto contrasta la generalidad del modelo. No acredita demanda de mercado ni que un estudio real planifique así.**

## Qué existe

- `shared/operational-services.ts`: 3 personas, 7 tareas, 4 hitos, 3 insumos; 4 opciones; 2 datos por comprobar. Solo importa `operationalModel`, `sha256Hex` y tipos.
- `tests/operational-services.test.ts`: 5 pruebas.

Cambio de vocabulario, no de modelo: recurso = persona; trabajo = tarea; «material» = insumo que no depende del equipo (aprobación del cliente, accesos, maqueta ya aprobada); compromiso = hito.

## El caso

La web del cliente A se lanza el viernes. Su desarrollo necesita la aprobación del diseño, que el cliente dará el jueves; después viene el QA, que solo hace Pau. La migración del cliente C depende de unos accesos sin confirmar.

- Con el plan declarado, el lanzamiento termina el lunes 16 a las 10:00Z. Cadena: QA ← desarrollo ← aprobación del cliente.
- El conflicto es de **un solo compromiso**: el hito no cabe por sí mismo con esa aprobación. Forma distinta a la del caso de instalaciones (dos o tres compromisos compitiendo), con el mismo código.
- Cuatro respuestas lo resuelven: dos horas extra de Omar el jueves, construir sobre la maqueta anterior, mover el hito, o repartir el desarrollo entre dos personas.
- Condición exacta: la aprobación como tarde el miércoles 11 a las 14:00Z.
- La migración queda indeterminada por los accesos; no se da por viable ni por incumplida.
- Qué comprobar antes: la fecha de aprobación del cliente A decide (si llega el miércoles no hay que hacer nada); los accesos de C no cambian esta decisión.
- El registro de ensayo y el borrador de decisión funcionan igual.

## Qué se probó

`npx tsx --test tests/operational-*.test.ts` → 58/58 (53 anteriores + 5). `npx tsc --noEmit -p .` → 0 errores.

- El planificador coincide con el oráculo exhaustivo en 18 combinaciones (dos fechas de accesos, tres ramas, tres objetivos), y el camino de tamaño real devuelve lo mismo.
- Invariantes de traza en el plan declarado y en cada alternativa.
- La fixture solo importa la API pública y no reimplementa nada del motor. Las huellas de los módulos de CORE-1 y CORE-2 siguen siendo las presentadas.

## Límites

- Simplificaciones heredadas que aquí pesan más: una persona por tarea, sin dedicación parcial ni trabajo en paralelo de una persona sobre dos tareas, sin reuniones ni dependencias con holgura, sin estimaciones con rango.
- Un «insumo» solo tiene fecha; no modela una aprobación que puede volver con cambios (eso sería una reapertura declarada como supuesto).
- Caso pequeño: todo es exacto. No se ha probado un estudio de 40 tareas.
- Sin revisión ajena. `CONTEXTO-PROYECTO.md` sin tocar.

## Huellas SHA-256

Se calculan al presentar; ver nota del tablón.
