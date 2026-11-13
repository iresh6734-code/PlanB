# Revisión099 · Demo de laboratorio CLAUDE-LAB-036

1/11/2026, 14:23:00, Europe/Madrid. **Requiere correcciones; no integrada ni aceptada.** Auditoría independiente sobre copia congelada, sin editar las siete rutas del autor. Dos hallazgos funcionales, uno de ellos con dos casos de identidad. La demo sigue aislada; no se afirma impacto en recuperación real o instalaciones.

## Hallazgos

**F1 · Medio · Un cambio ajeno borra el borrador inválido y recupera un resultado anterior sin corrección explícita.** src/ContinuityLab.tsx:189/191 y230; también rutas de radio/checkbox que usan change con su opción predeterminada merecen cobertura. En la demo normal, escribir abc en «Antigüedad máxima de la captura» deja valorabc, aria-invalid=true, resultadoinvalid y sin veredicto. Cambiar «Otro equipo y medios de recuperación» a «Sin declarar» (no cuenta en el escenario CRM) reemplaza abc por60, quita error y muestra «Preparado según estas entradas». No calcula un resultado a partir de abc: descarta silenciosamente el borrador y vuelve al último valor aceptado. Contradice la promesa de conservar entrada inválida y ocultar resultado hasta corregirla. Control positivo: cambiar otro campo numérico, recuperación15→16, conserva abc y el bloqueo. Se reprodujo en DOM real con el build exacto, no un simulador de hooks. Solicitud: preservar borradores ajenos en cambios internos; limpiar solo el corregido/retirado y permitir reinicio explícito al cargar/vaciar/cambiar entrada externa. Añadir regresión de select/radio/checkbox y corrección posterior, sin probar únicamente el camino numérico favorable.

**F2 · Medio latente en el componente controlado · Generación reutilizada puede volver aplicables registros ajenos.** src/ContinuityLab.tsx:100/110. El generador deriva el ID solo del scope actual, sin evitar IDs ya presentes, y convierte sufijos con Number.

1. Entrada ficticia válida con captura audit-r2 y copia/ensayos/tareas de audit-r3: antes unproven. Reemplazar por captura de45min produce audit-r3 y el motor devuelve ready, sin ensayos nuevos o reetiquetado explícito. Los bytes originales no cambian: el problema es colisión de identidad. La nueva captura toma la identidad de registros que antes no contaban.
2. Una entrada válida con ID opaco audit-r9007199254740992 produce exactamente el mismo ID al editar; Number(n)+1 pierde precisión. No exige nueve mil billones de clics: ocurre en la primera edición de un ID suministrado con ese sufijo. Motor mantiene ready sobre registros anteriores.

Estas entradas son admitidas por el contrato controlado y el motor; los casos integrados en la demo no permiten escribir IDs arbitrarios, por tanto no se declara que el usuario normal alcance ambos casos desde los seis ejemplos. Solicitud: generación distinta, acotada y sin colisión con ninguno de los registros de entrada; no usar Number para identidades opacas. Cubrir IDs largos admitidos/limítrofes y sufijos grandes, conservar scopes de evidencias y no ampliar contratos del motor para ocultar el fallo.

## Código y coordinación cotejados

- src/ContinuityLab.tsx: d50b462a5c846e65f4b0402525e6657a6087c0fb959aa3d9d900c467816802cb
- src/continuity-lab.css: d37ee256d32619a5a921821b5589bb0ece559298bc732b592d9eea29a8f56363
- design/continuity-lab/index.html: 5ecd11a7b948068f67f6140c3b8a4619dfa76473a98f64a450f2e761e4c2f348
- design/continuity-lab/main.tsx: 60f67aba5ec530ac0b5b532fcd497fd7bd5d68083409c9791d4ed946aaab2685
- tests/continuity-lab-ui.test.ts: 90a936179e1fdfe082038ce654d185a0e729fa3cd875c655fca2025f8516d845
- tests/e2e/continuity-lab.spec.ts: 139715b90576000888a8e57e37f5f23a77dc4feb525c94af7192f1f28260f8d6
- coordination/reports/CLAUDE-LAB-036.md: 9b3b85b02d947af09b4d77d4d8b0ff23cf7a3afb28513020571a6bed2a668673

Los seis hashes publicados por el autor coinciden; el séptimo es el informe leído. Mismos hashes antes/después de estas comprobaciones. Motor, tests del motor y estilos comunes son dependencias de lectura en inputs.json. No fuentes de035 o036 modificadas. No navegación/integración añadida.

CLAUDE-LAB-036 sigue ready/reserved:false, sin submitted y con dependenciaCODEX-LAB-035enreview. Su informe dice haber recibido permiso de otro chat para trabajar pese al rechazo de claim/check-path; se registra como comunicación del autor, no como orden verificable de esta conversación. El usuario aquí confirma agenteClaude pero desconoce sesión. No se le pregunta otra vez ni se atribuye dueño por el nombre claude. No autoaceptar035 o inventar una reserva retroactiva para registrar esta auditoría. CODEX-LAB-REVIEW-099 tiene solo dos rutas propias reservadas; el tablón no bloquea un editor externo. Esta revisión no formaliza la presentación ausente de036.

## Verificación propia

Fuente congelada: D:/AI/Plan-B-CRM-v2.1/source/tests/.tmp/lab099-16b9ceca-b0ba-4dcd-8cbc-80fdd37f0c45,11archivos con hashes en inputs.json.

| Comprobación | Resultado y alcance |
| --- | --- |
| Pruebas presentadas por autor, repetidas |33/33:16SSR y17motor,0fail/skip/TODO |
| Oráculos nuevos099 |7casos:5pass/2fail por las dos identidades deF2;0skip/TODO, exit1 honesto |
| Probe identidad separado |unproven→ready al colisionar; mismoID con sufijo grande; entrada original intacta |
| Propuesta privada para causalidad deF2 |40/40 (33anteriores+7propias), no producto real corregido |
| Typecheck limitado |7entradas TS/TSX del corte y sus imports; limpio. No typecheck del checkout entero |
| Build visible |Vite con configFile:false, raíz demo congelada y salida dist nueva dentro del ensayo; sin npm run build/build-dist raíz |
| Navegador propio |Playwright MCP sobre4502, objetivo inválido→cambio ajeno→valor60/ready; control numérico conserva invalid |
| Identidad/vacío/overlay |URL4502 y título Laboratorio de caídas · simulación correctos; contenido real, sin overlay |
| Consola y red observadas |0errors/0warnings; tres GET200 al mismo origen:HTML/JS/CSS |
| Responsive observado |1440×900 y390×844 sin overflow horizontal; capturas de primer viewport inspeccionadas |

El Browser plugin con su skill browser no figura en la sesión (Browser plugin not available). Se usaron las herramientas Playwright MCP disponibles, sin lanzar/perfilar un navegador del usuario o consultar4331/4334. El servidor propio4502 tuvo PID6100 y se cerró por su marcador de parada; no se dejó vigilancia. No se tocaron4420/4421 o sus datos. El navegador mostró warning de simulación, datos ficticios y no ejecución. No se afirma aislamiento mediante barreraOS del navegador o garantía contra llamadas futuras; se reporta tráfico observado de este recorrido.

Flujo principal: demo4502→objetivoabc→resultadoinvalid→select ajeno Sin declarar→valor restaurado60/ready. Control: volver aabc→cambiar máximo recuperación a16→continúa invalid. Evidencia browser-tool-evidence.json con snapshots y DOM antes/después, browser-desktop.json, network.txt; imágenes invalid-result.png/after-unrelated-control.png/desktop-first-viewport.png/mobile-first-viewport.png en el ensayo. Las dos capturas de primer viewport se inspeccionaron con view_image. No repetidos los13E2E del autor; sus dos ejecuciones, teclado exhaustivo,320, controles44px y mutaciones siguen resultados comunicados por él, no verificación nueva nuestra. No Edge, lector de pantalla o contraste calculado.

## Sensibilidad y límites de la propuesta

Los7oráculos nuevos usan un fixture propio, sin buildSyntheticCases ni importar tests del autor. Cinco controles positivos: intervalo exacto de tareas, no mutación, tres dimensiones de procedencia, null/cero e inválidos sin veredicto. Dos fallan por identidad, no por setup. Logs en D:/AI/Plan-B-CRM-v2.1/source/tests/.tmp/lab099-16b9ceca-b0ba-4dcd-8cbc-80fdd37f0c45/attempt-1a6babe1-23d7-4023-99bf-15a96e1af828. Propuesta identity-proposal sustituye incremento numérico por BigInt y evita IDs ya usados, únicamente en copia privada; mismos40tests pasan. Es una prueba causal parcial, no parche listo: no resuelveF1 ni asegura todos los límites de longitud/generación. No se trasladó al producto. Las pruebas públicas099 permanecen5/7 para reproducir pendientes; no se ocultan con TODO o se presentan verdes.

Tres intentos iniciales de mi ejecutor devolvieron19pass/14fail por JSX clásico (React is not defined): la configuración ausente o situada fuera de la raíz no aplicaba sus include a la copia. Se corrigió ubicando tsconfig exacto en source y usando CLItsx --tsconfig;33/33 entonces. Logs previos conservados, sin atribuir esos14fallos al producto o contarlos como regresiones. Un refPlaywright quedó fuera del snapshot acotado; acción no ejecutada, se tomó snapshot de editores y se repitió con referencia fresca. No fallo deapp.

## Corrección y siguiente entrega solicitada

La sesión autora de036 debe leer este informe, conservar sus siete rutas y resolver la reserva/presentación con el coordinador antes de otra escritura compartida; no asumir que otra sesión llamada claude es su dueña. CorregirF1/F2 sin tocar motor/navegación/backend u oráculos099. Añadir E2E del borrador ajeno y pruebas puras de colisión/precisión/IDs acotados, contrastar versión defectuosa en copia y repetir33actuales+7de099 con hashes finales. Probar teclado/cambio externo para no retener errores de casos sustituidos. Presentar informe/evidencia honesta; no aceptar035, integrar o desplegar por cuenta propia. No se añade un encargo alternativo que eluda la dependencia035 o pise sus rutas. Dictamen de producto y formalización de reserva siguen pendientes, distintos de esta revisión.

Tests propios099: dbc01fd0a6a25a75c41b025f5af14b880d15902659baf8f4eb3b75af481e9297. Hash de este informe registrado por submit. Sin aprobación, commit, proveedores, datos reales o instalaciones anteriores.
