# Revisión independiente CODEX-UX-003

29/10/2026, Europe/Madrid. Revisor Codex review_h2, distinto del autor. **Aceptar** la guarda de vigencia en compare y sus regresiones, tras revisión de causalidad y cotejo de hashes. Solo se escribe este informe, sin fuentes, proveedores, cuentas, navegador o secretos. Contexto y panel permanecen a cargo del coordinador que los reserva.

## Corrección y compatibilidad

compare ahora incrementa el mismo revision.current que read y el efecto ligado a tenant/contact. Captura esa revisión antes de iniciar la promesa y solo aplica setDiff, setError y setBusy(false) si sigue vigente. Cambio de empresa/contacto o cleanup invalidan la respuesta anterior; una petición nueva del mismo contexto invalida también la previa. El finally antiguo ya no desbloquea botones de otra lectura. El inicio conserva busy/error y el transporte no cambia. Resultado, error y reintento en el contexto vigente siguen funcionando. No se cambia API, estilos, permisos o contenido de capturas.

Se reconstruyó el baseline únicamente en memoria retirando de compare la captura de revisión y las tres guardas; SHA256 c2c8a369f7d6edbcc43b62cc1276549c4ab2d4ef0876be022224a2e76c939204 coincide con el baseline del tablón. No se modificó el archivo para comparar. Esto confirma que la diferencia de fuente está acotada a compare y no altera read/efecto.

## Revisión del arnés y evidencia independiente

El arnés lee y transpila el componente real; sus imports se limitan a hooks controlados, objetos JSX e icono inocuo. Ejecuta callbacks reales y resuelve o rechaza transportes diferidos en orden explícito. No copia compare en otra función. Los slots conservan refs entre renders y ejecutan cleanup al cambiar dependencias o desmontar. El recorrido actual termina ante undefined y no vuelve por defecto a la raíz. El doble render tras el efecto simula la aplicación de sus setters, sin atribuirlo al reconciliador real.

Ejecutado por este revisor:

    node --require ./scripts/block-external.cjs --import tsx --test --test-concurrency=1 tests/hubspot-context-ui.test.ts

**5/5 correctas**: mismo contexto/reintento, empresa anterior con nueva comparación, error anterior y nuevo contacto, lectura más reciente del mismo contexto, y escrituras tras desmontaje. Se comprueba también busy de la petición vigente. La ejecución previa al cambio con un control correcto y cuatro fallos de regresión corresponde al autor; no se presenta como repetida por este revisor. El informe del autor diferencia el primer fallo del arnés por recursión del resultado de regresión válido. Typecheck y build correctos constan en su entrega; no se repitieron en esta revisión.

## Límites

El arnés es un modelo mínimo de hooks, no React DOM, StrictMode, scheduling concurrente real, navegador, accesibilidad o E2E. No acredita QA visual. Las promesas anteriores pueden terminar en el servidor: se descarta su aplicación local, sin cancelación de red. Se conservan esas limitaciones en el informe final. Sin problemas materiales restantes dentro del alcance.

## Versiones aceptadas

- src/HubspotContext.tsx: 0c993d1f447236a3c9a3e14a7fe9b6421b7850e0522977623fd6b03a30538fa2
- tests/hubspot-context-ui.test.ts: a8a9b125d0037c2fd4b75a23882558c1a28c1c93a48c7a1c0a869551cd881859
- coordination/reports/CODEX-UX-003.md: e22cb42dcbaaf220844f8aff4e6eab31824b6e75d44f2b2135d801b9ce843421

Los tres hashes coinciden con la presentación vigente. CODEX-UX-003 aceptada por un revisor distinto del autor. Este propio informe se presenta para revisión del coordinador y no se autoacepta.
