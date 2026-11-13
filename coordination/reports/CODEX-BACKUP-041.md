# BACKUP041 · Verificar una copia antes de restaurar

29/10/2026, 22:57 Europe/Madrid. Autor Codex, skill base compliance-autopilot-execution-core. Seis archivos exactos reservados, sin solapes con Claude. Ningún archivo existente de producto modificado.

## Resultado utilizable

Verificador reutilizable `server/recovery-preflight.ts` y herramienta de consola `scripts/check-recovery-copy.ts`. Trabajan con el archivo JSON portátil seleccionado explícitamente; no aceptan ZIP, no buscan bases ni claves y no restauran una instalación.

```powershell
node --import tsx scripts/check-recovery-copy.ts --help
node --import tsx scripts/check-recovery-copy.ts --file RUTA-EXPLICITA.json
```

La segunda línea es sintaxis de uso, no un archivo real examinado en esta tarea. Para copias cifradas, `--password-stdin` obtiene la contraseña exclusivamente de stdin; no existe argumento de contraseña. No poner secretos en comandos o documentación para preparar una prueba.

Opcionalmente `--account PORTAL --data test|production` contrasta la identidad declarada del destino. No lee ajustes de una instalación ni comprueba su protección. Salida JSON: código 0 válido en las comprobaciones del archivo, 1 inválido/incompatible, 2 uso/lectura incorrectos. Sin argumentos muestra ayuda y no lee archivos o stdin.

## Comportamiento

- Hasta 32 MiB, JSON UTF-8; lectura de un archivo regular explícito con tamaño/mtime cotejados al final. La contraseña tiene entrada acotada y no se refleja en argumentos, resultados o errores.
- Contenedor cifrado actual `planb-encrypted-v2`: comprueba campos, scrypt, sal de 16 bytes y base64 canónico; descifra con la implementación existente. Contraseña incorrecta y ciphertext alterado fallan sin exponer errores internos.
- `BundleSchema` y una **restauración de prueba en Store(':memory:')** validan datos, especificación, generación aprobada, relaciones y reproducción del historial. Reutiliza el contrato real de restauración, sin crear un validador divergente. La base desechable se cierra al finalizar.
- Hash SHA-256 del texto examinado y resumen sin registros, nombres de clientes, correos, campos o contraseñas: identidad de captura/portal, fechas, clase ficticia/real, recuentos por entidad, historial total y cambios pendientes según watermark conservado.
- Predice que una aprobación anterior se retira al restaurar y que un envío interrumpido se conserva como incierto. No repite operaciones ni cambia la aprobación del Store que generó el fixture.
- En claro solo admite datos ficticios; datos reales requieren copia cifrada y siguen sujetos a protección de la instalación para una restauración efectiva. Una coincidencia opcional de portal/clase no autoriza esa restauración.

## Verificación propia

```powershell
node --require ./scripts/block-external.cjs --import tsx --test --test-concurrency=1 tests/recovery-preflight.test.ts tests/recovery-preflight-cli.test.ts
```

**17/17 correctas:** 12 del módulo y 5 de la CLI. Typecheck completo correcto con `.\\node_modules\\.bin\\tsc.cmd --noEmit`. Los casos de CLI incluyen subprocesos reales sobre archivos ficticios temporales y contraseña ficticia por stdin; comprueban códigos de salida, ausencia de reflejo de secretos/rutas y bytes originales intactos.

Casos cubiertos: copia ficticia en claro, cifrado válido, contraseña ausente/incorrecta, manipulación autenticada del ciphertext, contenedor no canónico, portal y clase ajenos, registros editados sin historial, watermark devuelto frente a historial total, datos perdidos, generación sin aprobar, JSON/formatos no soportados, exceso de tamaño y entradas inválidas. Producción es un fixture que cumple v3/HubSpot/STANDARD, no datos o cuenta real. Los planes de devolución se preparan con transporte falso en memoria identificado como protocolo HubSpot; ninguna operación de proveedor se ejecuta.

Las pruebas de planes verifican tanto retirada de aprobación como conversión de sending a uncertain después de la restauración de prueba. La prueba de canario confirma que contenido personal ficticio no aparece en el resumen; no demuestra ausencia forense del texto en la memoria del proceso que acaba de descifrarlo. No se promete borrado seguro de strings JavaScript.

No fue necesario repetir las suites anteriores: no se modificaron módulos existentes y estas pruebas ejercitan directamente decodePortable y restoreBundle. No Vite, E2E, navegador, listener o acceso al piloto. Fixtures CLI eliminados con unlink de archivos conocidos y rmdir no recursivo; no limpieza de carpetas ajenas.

## Prompt y encargo de Claude

`coordination/briefs/CLAUDE-QA-042.md` preparado a petición del usuario. **CLAUDE-QA-042 ready**, con dos archivos propios: `tests/independent-continuity-review.test.ts` y `coordination/reviews/CLAUDE-QA-042.md`. Revisa LAB035, OPS039 y DIFF040 mediante pruebas adversas y hashes actuales, sin editar sus fuentes. El usuario puede pegar la instrucción para leer y ejecutar ese brief en su sesión Claude.

El prompt ordena terminar/presentar UX038 si sigue working, conservar congeladas las presentaciones y cerrar la precondición pendiente de UX032 solo si es la misma sesión autora. No atribuye actividad o aceptación al modelo por existir un registro. Al último cotejo UX038 working y UX032 working; no se revisaron esas nuevas fuentes aquí. No se ejecutó consult.mjs ni se enviaron nuevas fuentes a Anthropic desde Codex.

## Hashes SHA-256

| Archivo | Hash |
| --- | --- |
| server/recovery-preflight.ts | 5cbcd229a9b7e5ba08ac7b785542819e937412f9ae9def176d0f5b6776636a3b |
| scripts/check-recovery-copy.ts | b30b4489f572cd1d62da35e14cf2c4bf54778c83ec0bf065a46f54757b1a3b70 |
| tests/recovery-preflight.test.ts | 12b54912025b99d43894315c75f727acbc97088638e945b78fb810b4316e229f |
| tests/recovery-preflight-cli.test.ts | 6414791e2747f8f8e3818faff8e433ec6307096c298f6675a96e359a4ffd312c |

## Límites y continuidad

No es una pantalla, endpoint desplegado, ensayo en otro equipo ni prueba de custodia externa. No inspecciona ZIP o DPAPI. Formato válido y descifrado correcto no acreditan autoría, actualización o ejecución remota. Los controles previos a restaurar en una instalación siguen siendo obligatorios en sus rutas existentes. Las lecturas de archivo no garantizan detectar cualquier modificación deliberada que conserve tamaño/mtime; el hash identifica los bytes efectivamente leídos.

Contexto/panel se actualizan bajo reserva propia LAB035, devuelta exclusivamente para continuidad documental. Código y contratos anteriores congelados. BACKUP041 se presenta para revisión, sin autoaceptación; tampoco se aceptan LAB035/OPS039/DIFF040 por haber producido este prompt. Siguiente: Claude entrega QA042 y Codex contrasta los casos/hashes; resolver hallazgos y aceptar unidades antes de su integración/despliegue. Sin commit/push, servicios modificados, bases reales, proveedores o recursos corporativos.
