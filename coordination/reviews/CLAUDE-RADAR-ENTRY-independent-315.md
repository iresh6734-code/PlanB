# Entrada del Radar · revisión independiente315

9 de noviembre de2026, Europe/Madrid. **Dictamen vigente: solicitar R3 por F2/P2. F1/P2 queda cerrada en R2; se conserva abajo la devolución original. Las siete reservas de Claude se mantienen.** No se modificaron sus fuentes ni se montó en App o main.

## F1/P2 · la activación puede dejar ambos controles inutilizados indefinidamente

Ubicación: src/CommitmentRadarEntry.tsx, activate, línea41, y los botones de línea62. La espera de activateRadar carece de plazo propio; mientras no se asiente, activating queda true. La activación y Actualizar estado están deshabilitados. El GET inicial sí tiene plazo15s, el POST no lo tiene. Si la respuesta se queda retenida, la persona no puede conocer el escenario que el servidor ya creó mediante la lectura ofrecida por la propia entrada. Recargar toda la página puede recuperar, pero el bloque no resuelve ni explica la incertidumbre.

Reproducción propia: abrir copia ficticia sin escenario; interceptar solo la respuesta del POST dejando que route.fetch alcance el servidor real; comprobar registro de una activación201 y capacidad available del mismo pin; retener el acuse al navegador; avanzar180000ms con reloj de Playwright. Continúa el botón Activando… y no hay vía habilitada de Actualizar estado. No se esperaron tres minutos de pared. La sonda falla en esa aserción de interfaz tras comprobar el efecto; no llegó a ejecutar sus aserciones posteriores de recuperación en la versión defectuosa.

## Pruebas y procedencia

Banco tests/.tmp/radar-entry315-H1B7jN: **46/47 Chromium**, tipos focales0, duración196012,529ms, un trabajador, sin retries/skips/flakies. Pasan las11 pruebas originales de entrada,19 del Radar,15 de SCENARIOS y el control nuevo de respuesta tardía tras cambiar pin a null. Falla únicamente la sonda del acuse retenido. Se comprueban efectos por peticiones del servidor/SQLite ficticia y capacidad, no por texto de éxito. El JSON y error-context conservan la aserción exacta. Dos sondas propias en tests/e2e/independent-radar-entry315.spec.ts; reutilizan explícitamente el arnés/ayudantes de la autora, no se presentan como arnés independiente desde cero.

Se congelan las siete huellas presentadas antes y después. Baseline completo de303, con informe cf908430… previamente aceptado; no se adopta305review ni308review. Tres dependencias adicionales —escenario multisistema, semilla y montaje291— coinciden con sus versiones done. El manifiesto lista cada fuente. El amplio baseline histórico conserva dependencias pendientes: no es aceptación global de sus unidades ni candidata final. No se copiaron ediciones working.

Browser plugin not available; se usa Playwright del proyecto y Chromium de caché existentes. Servidores loopback efímeros, SQLite nueva por caso, entorno mínimo, red exterior bloqueada. Los recibos de cierre del arnés se cotejaron y no queda hijo pendiente. Demo4601 no es el objetivo de estos E2E.

## Control causal privado

tests/.tmp/radar-entry315-causal-3XLK7x: solo en copia se limita la espera completa con Promise.race de15s y CommitmentError unknown:true; el temporizador se limpia. **13/13 Chromium**, tipos0: las11 originales más las mismas dos sondas, sin modificar aserciones. La sonda antes fallida ahora habilita lectura, encuentra el escenario por GET y mantiene un único POST. La fuente privada se restaura por hash después; el checkout de la autora sigue intacto. Es prueba causal y orientación, no parche integrado ni dictamen favorable anticipado de una R2 futura.

## UI observada y límites

Se abrieron las capturas320 de activación y ficha con procedencia. En esas vistas los textos y botones caben en el ancho y se distinguen datos ficticios/no conectado; las pruebas cubren también390/1440 y teclado. SSR no se usa para sostener geometría. No se afirma consola absolutamente vacía: las suites de la autora no contienen auditoría exhaustiva de consola/advertencias. No hay lector de pantalla real, Edge/Safari,401 real de esta entrada, App/main empaquetado ni instalación actualizada. El caso copia no ficticia se simula en el borde y se identifica como tal; otros casos usan servidor real.

## Huellas de autora revisadas

- src/CommitmentRadarEntry.tsx: 99f0ef1a9ded95b11abc04bbd817371ab8ac910a10f7e9b2eabeb032faf53ff5
- src/commitment-radar-client.ts: 18642bfde8609c1663872ac873bddfdd22baeb23b823dc23f7bed6d0fceefb81
- src/CommitmentRadar.tsx: 60224e3b553fdf698936ed583cc4314d5ae6c4f80817d8083426c6e8a1d283c1
- src/commitment-radar.css: fc47d8206f50a0b8edc619aa29c92d688fe95cb23f2349893f3ba31e94a530d8
- tests/e2e/commitment-radar-entry.spec.ts: 8a8299c3b885b3b9f0825a8ef4a0a380c3390686eeca699153c41d1faf497cb5
- coordination/plans/RADAR-MOUNT-HANDOFF.md: 0236cf1f568a19085ab0cd1e6d8cb9fddaea20b9a15b5c8090e10ce0651051a4
- coordination/reports/CLAUDE-RADAR-ENTRY-MOUNT-READY.md: 4001e174b9e4c896df6823022580c7b787009ba8e783ca183af115d35ffa6120

Siguiente: autora corrige únicamente sus rutas reservadas, añade regresión sensible y presenta nuevas huellas. Codex repite la combinación antes de aceptar. El coordinador conserva316/API y montaje.

## R2 · F1 cerrada, F2/P2 nueva: un401 obsoleto bloquea la vista posterior

10 de noviembre de2026, Europe/Madrid. Se leyeron las siete fuentes presentadas y cotejaron sus huellas antes/después. Entrada b006c446…, cliente b133be0b…, pruebas b34bf92d…, informe d56e4c4d…. F1 queda cerrada: la activación termina por plazo propio aunque el transporte no atienda abort, ofrece comprobar porGET, no reenvía sola y las dos sondas originales315 pasan sin cambios.

Banco tests/.tmp/radar-entry315-r2-soKpJs: **52/54Chromium**, tipos0,321294,84ms, un trabajador, sin retries/skips/flakies. Pasan16 deautora,19Radar,15SCENARIOS ylas dos sondas originales315. Fallan solo dos exploratorias nuevas: liberar un401 antiguo de activación o capacidad después del plazo y de unGET real posterior. En ambos casos el contador global planb:locked pasa a1 y la entrada se bloquea. Las respuestas401 de esos dos transportes se simulan; elGET posterior sí llega al servidor real.

**Causa.** commitment-radar-client.ts, funciones call ysendActivation: tras esperarfetch se emite planb:locked ante401 antes de comprobar si la señal ya se abortó. La carrera evita que el resultado antiguo asiente view, pero no cancela ese efecto global ejecutado dentro del trabajo que sigue vivo. Una nueva lectura correcta puede ser invalidada por esa terminación anterior. No basta descartar el retorno delPromise.race.

**Contraste con401real.** tests/.tmp/radar315-late401-real-W6shZ6: una prueba, tipos0, falla exactamente contador1frente0. Servidorprotegido/SQLite nuevos y contraseña ficticia; cookie original capturada solo enmemoria. Un wrapper deliberadamente omiteAbortSignal para la activación, aunque usa fetch nativo; elPOST retenido se envía con su cookie original después de bloqueo/login nuevos. UnGET autenticado posterior ya había dado capacidad válida. El servidor rechaza elPOSTantiguo con401real, acreditado por auditoría de solicitudes. Al liberarlo se emite elbloqueo global antiguo. No se registran cookies/contraseñas reales. No es la App ni unproveedor real; el transporte que ignora cancelación es una condición explícita del contratoR2.

**Archivo canónico del revisor.** Se añadieron tres sondas y un controlpositivo sin modificar las dos originales. tests/.tmp/radar315-six-9MgZmJ: seis pruebas ejecutadas, tipos0; trespasan (dosoriginales y401realvigente) ytresfallan (dos401simuladosobsoletos y401realobsoleto),186971,368ms. Elcontrolvigente exige un único evento de bloqueo y retirar la vista cuando la petición actual recibe401real. No se permite corregirlo eliminando indiscriminadamente los eventos401. Esta ejecución no se presenta como una pasada completa de56.

**Causal privado.** tests/.tmp/radar315-late401-causal-ey8EiP: comprobar señal abortada inmediatamente después de fetch y antes de cualquier efecto401, tanto en call como sendActivation; cancelar cuerpo sin esperar ypropagarAbortError. Solo encopia.21/21Chromium (16autora, dos originales, dosexploratorias y401realobsoleto), tipos0,187734,816ms, sin retries/skips/flakies; fuente privada restaurada. Elcontrolpositivo adicional se añadió después yno se atribuye aese21; debe repetirse en R3 juntoalas seis canónicas. No se integró elparche nise editó código deClaude.

Elbaseline sigue congelado desde315, generador aceptado cf908430 yfuentesestables291; no seacepta305/308 ni se usa working316. Browserplugin no disponible: Playwright yChromium1228 existentes, puertos efímeros/ficción, exteriorbloqueado. No nuevaauditoríaexhaustiva deconsola, lector depantalla oinspección visual deestaR2; estilos ycomponenteinternoRadar no cambiaron. El401real añade cobertura deestacliente, pero no pruebaAuthGate/montajeApp, maincompilado, instalación oEdge/Safari. Recibos de cierre propios delarnésconservados.

**R3 requerida.** Retirar efectos globales de respuestasabortadas/obsoletas deactivación ycapacidad, mantener el bloqueo deun401vigente, no reenviarPOST ni adoptarotraautorización. Conservar elplazo, incertidumbre yguardias deR2. Seis sondas canónicas disponibles, sinmodificarlas. FuentesR2 revisadas:

- src/CommitmentRadarEntry.tsx: b006c446de47e48f140d28ed6f963c9fd0d3b2eff00778bd4a186eb0cd997f4b
- src/commitment-radar-client.ts: b133be0b7bef06a385389147d6bc97d167d147dddf9716c405592a953d09fe12
- src/CommitmentRadar.tsx: 60224e3b553fdf698936ed583cc4314d5ae6c4f80817d8083426c6e8a1d283c1
- src/commitment-radar.css: fc47d8206f50a0b8edc619aa29c92d688fe95cb23f2349893f3ba31e94a530d8
- tests/e2e/commitment-radar-entry.spec.ts: b34bf92d5a3b1da81e856693340741f2f55bcd0a74602f9806d8e8284f15ddf2
- coordination/plans/RADAR-MOUNT-HANDOFF.md: b47806064990210889333c326a524dc798029d6ca2033e4451b3e3f74d83f1b2
- coordination/reports/CLAUDE-RADAR-ENTRY-MOUNT-READY.md: d56e4c4da73ef5cf6ad932d4f47bdd73ecefb5bb00ffad0657831a267676e183
