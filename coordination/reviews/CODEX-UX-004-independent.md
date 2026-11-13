# Revisión independiente CODEX-UX-004

29/10/2026, Europe/Madrid. Revisor Codex review_h2, distinto del autor. **Aceptar** la semántica visible de fechas tras revisión, ocho pruebas propias y dos mutaciones exclusivamente en memoria. Solo se escribe este informe; sin archivos de fuente/tests modificados por el revisor, navegador/ventanas, proveedores, secretos o nuevas fuentes aClaude. Coordinador actualiza contexto/panel en su reserva vigente.

## Cambio revisado

Las tareas muestran Vencimiento; los otros cuatro tipos FechaCRM, sin atribuir envío/recepción o ejecuciónreal. El helper frontend requiere un Date de valor finito y devuelve Sinfecha ante null/inválido; no es un parserISO nuevo o sustituto del normalizador backend. El formato es es-ES sin opción timeZone, preservando la decisión de hora local. No introduce hooks/estado/red o modifica guardas read/compare, clases ocontroles.

Se reconstruyó el baseline enmemoria al retirar únicamente activityDate y restaurar el JSX anterior de fecha; SHA2560c993d1f447236a3c9a3e14a7fe9b6421b7850e0522977623fd6b03a30538fa2 coincide con el baseline deltablón. Sin escrituras temporales de fuente.

## Evidencia independiente y sensibilidad

Ejecutado por el revisor:

    node --require ./scripts/block-external.cjs --import tsx --test --test-concurrency=1 tests/hubspot-context-ui.test.ts

**8/8 correctas**, incluyendo cinco guardas anteriores contra callbacks obsoletos y tres casos de semántica/fallback/zona. El caso de zona cambia TZ aUTC yAmerica/New_York dentro de try/finally y restaura el valor anterior. El arnés transpila el componente real con hooks/JSXcontrolados; renderizar no produce consultas nuevas.

Dos procesos separados ejecutaron el mismo archivo de pruebas transpiliado con la fuente del componente sustituida solo enmemoria:

- Forzar timeZoneEurope/Madrid en activityDate:7correctas y1fallo esperado en casozona; bajoUTC seobserva13:00 en lugar de12:00. Así se verifica la zona independientemente de la etiqueta nueva.
- Retirar únicamente Number.isFinite(date.getTime()):7correctas y1fallo esperado en fechasinválidas, por FechaCRM:InvalidDate en lugar deSinfecha.

Los fallos fueron aserciones concretas, no errores de carga/arnés, ylos controles de revisión siguieron pasando. No se alteraron las fuentes, tests, TZdelproceso principal o datos de app. Las trespruebas nuevas fallando en baseline, typecheck, buildViteaislado, detectorydiffcheck son evidencia delautor; no se repitieron por este revisor. El informe delautor distingue que el negativo inicial de zona exigía también la etiqueta; las mutaciones propias resuelven esa duda de sensibilidad.

## Límites

Arnés de hooks/callbacks yobjetosJSX no esReactDOM/StrictMode/browser ni QAvisual/accesible. TZNode verifica eluso de lazonapredeterminada deIntl, no un navegador o la configuraciónpersonal delusuario. No foco real, contraste,320px/zoom200% o lectorpantalla. La etiqueta no cambia recencia global ni los IDsseleccionados; frontend consume contratoHS024 normalizado. Sin despliegue/reinicio o APIreal. Elbuildaislado ydetector no acreditan QAvisual. Sin problemasmateriales restantes en este alcance.

## Versiones aceptadas

- src/HubspotContext.tsx: f649cebf9f96684e12d84e619aa6c848d0a58f1b938b0b81ecb116ac0abd94a1
- tests/hubspot-context-ui.test.ts: 77a851df2fd909419938bda7fa289b24ecc9bfa9995bd55d86c48c9df4fc79c0
- coordination/reports/CODEX-UX-004.md: 7f116d3ea22f0cb44f5e6c166ca373284399b3399214e5c25896f57ba58f7dbf

Los tres hashes coinciden con la presentación. CODEX-UX-004 aceptada por revisor distinto del autor. Este propio informe se presenta para revisión del coordinador sin autoaceptarlo.
