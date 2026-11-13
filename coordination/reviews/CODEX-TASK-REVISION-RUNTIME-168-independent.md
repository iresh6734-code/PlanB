# Runtime168 · revisión independiente176

4/11/2026, Europe/Madrid. **Dictamen favorable: aceptar168 sobre las tres huellas presentadas.** Revisor distinto del autor. No se instala ni modifica una preview existente.

## Alcance verificado

El único cambio de producto es `taskRevisions: true` en `createBaseApp` del runtime. Al retirar esa cadena en memoria, SHA-256 vuelve exactamente al runtime090R2 aceptado: `b1324021f93ba8be9bf9acce5d5067e5ecd5c7db5af8559b71668b53f77b4ca5`. El bloqueo precede a la apertura del Store y la guarda de evidencia corrupta se conserva.

Repetición propia de la prueba HTTP del autor con runtime compilado, HTML mínimo, seed/clave de test/base nuevos y bloqueo de red externa: ruta de revisión200, identidad ligada a endpoint/PID, sesión configurada401 sin cookie y200 con cookie, no-store/VaryCookie. Dos PATCH de la misma revisión devuelven200/409, una fila de historial, replay409 y no-op con revisión nueva changed:false. La API de runtime mantiene aiConfigured:false y rechaza reconexión externa403. No se enviaron solicitudes a un proveedor.

Con el runtime propietario vivo, un segundo proceso main compilado termina1 por bloqueo; digest readonly de meta/records/changes intacto y revisión ganadora todavía servida por el dueño. Evidencia nueva del revisor: `tests/.tmp/runtime168-bd4c0dca-3d8a-4238-bea5-effc0e15bf0b/observed.json`, instancia `2c8ea4c6-e859-4378-8604-07ce9d54d927`, puerto57723, runtime29640 y contendiente26852. Ambos tienen registros close propios; solo se cerraron procesos creados por estas pruebas.

## Resultados del revisor

- **19/19** en una ejecución: runtime1 + montaje8 + servicio10. `tests/.tmp/review176-node.log`.
- **9/9** en otra ejecución: API6 + bootstrap3. `tests/.tmp/review176-regression.log`.
- Total28 casos distintos ejecutados en dos comandos; no se presenta como una única pasada28/28.
- Typecheck focal de runtime y test, ES2023/DOM/Bundler/strict:0 errores.
- Las tres huellas coinciden con submit168. No se modificaron las rutas del autor.

```powershell
$env:NODE_ENV='test'
node --import tsx --test tests/task-revision-runtime.test.ts tests/task-revision-mount.test.ts tests/task-revision.test.ts
node --import tsx --test tests/task-revision-api.test.ts tests/recovery-bootstrap.test.ts
node node_modules/typescript/bin/tsc --noEmit --target ES2023 --lib ES2023,DOM,DOM.Iterable --module ESNext --moduleResolution Bundler --strict --skipLibCheck --esModuleInterop --types node server/runtime.ts tests/task-revision-runtime.test.ts
```

Comandos HTTP/procesos con autorización de loopback; sin perfiles existentes ni bases ajenas. No se repitió el baseline404 ni todo npm test: esa evidencia es del autor. No se ejecutó navegador: el HTML mínimo prueba arranque/API.

## Huellas aceptadas

| Archivo | SHA-256 |
| --- | --- |
| server/runtime.ts | e930dd2aac6c6547d3faf54261171084c02d04c303a255c602f419486998067e |
| tests/task-revision-runtime.test.ts | 397df8da484f5e2ea0846c885aa5d13c5e2afd7407e13d24e96e43287093b556 |
| coordination/reports/CODEX-TASK-REVISION-RUNTIME-168.md | 02bde4561036be5be988ab992abff44c11823da566ece849a6d018a300493eb9 |

## Límites y siguiente paso

Servicio montado en ambos lanzadores aceptados, con un escritor cooperativo por carpeta. No es CAS global frente a procesos que ignoran el bloqueo ni idempotencia por intención; las rutas legacy no cambian. El cliente166 aceptado sigue aislado: ni esta unidad ni la aceptación montan esa estrategia en136/ficha/App.

La preview161 permanece con backend anterior; esta revisión no la reinicia. U1 fue devuelta por revisión174 por atribución falsa en aceptación humana + recarga fallida; CONTRACT170/U2 siguen dependiendo de su aceptación. Otro Codex revisa116R4, sin duplicación. El siguiente trabajo de montaje de revisiones o renovación de preview exige su propia reserva y verificación de identidad/artefactos.
