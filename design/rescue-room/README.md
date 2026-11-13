# Sala de rescate · demo aislada (CLAUDE-RESCUE-106)

Ensayo con **datos ficticios**: lleva a una pyme desde «el CRM lleva 8 horas caído» hasta «hemos conservado el trabajo y revisado cómo devolverlo», con persistencia real, un CRM simulado y fallos reproducibles. **No es una instalación de producción**, no conecta con HubSpot y no forma parte de la navegación de la app. Todo envío es simulado.

## Qué hay detrás (no es una maqueta)

- **Cola de prioridades:** `buildResponseQueue` (existente), sin reimplementar fechas ni estados.
- **Trabajo local:** `Store` (existente) en una carpeta nueva: validación, transacciones y tabla de cambios.
- **Retorno:** `Recovery` (existente) — preview, decisión por campo, aprobación ligada a la revisión, aplicar, conciliar incierto — contra un CRM simulado propio con estado en `crm-sim.json`.
- **Diario, versión esperada e idempotencia:** `server/rescue-room-journal.ts` sobre `meta`/`transaction` del Store.
- **Servidor propio** en `127.0.0.1` (`server/rescue-room-api.ts`); nunca se monta en los servidores del producto.

## Cómo abrirla (comandos comprobados en este equipo)

1. Compilar la interfaz en una carpeta propia (sin `npm run build`, sin tocar `dist/` ni `build/` de la raíz):

```bash
npx vite build design/rescue-room --outDir "$PWD/tests/.tmp/rescue106-dist" --emptyOutDir --base ./
```

2. Ensayo nuevo (crea `tests/.tmp/rescue106-<id>`; falla si el puerto está ocupado, no mata procesos ajenos):

```bash
npx tsx scripts/demo-rescue-room.ts --port 4511 --dist tests/.tmp/rescue106-dist
```

3. Reanudar **el propio** ensayo tras cerrar el proceso (solo admite carpetas creadas por el lanzador bajo `tests/.tmp/rescue106-*`, sin enlaces y con marcador válido; no vuelve a sembrar):

```bash
npx tsx scripts/demo-rescue-room.ts --port 4511 --dist tests/.tmp/rescue106-dist --resume tests/.tmp/rescue106-<id>
```

`--now <ISO>` fija el reloj (fixture y cola reproducibles). Abrir `http://127.0.0.1:4511/`. Parar con Ctrl+C.

## Guion de la demo (≈ 2 minutos)

1. **Estado inicial:** banner de ensayo, captura con revisión, incidente de 8 h. Acción principal: «Elegir un plan de 60 minutos».
2. **Plan:** «Cargar estimaciones del guion» (declaradas y editables). 60 min → 3 tareas caben; 30 min → 1. Las demás aparecen con su motivo. Que quepan no es que se hayan hecho.
3. **Trabajo local:** abrir *task-4* → estado «Completada» → «Revisar el cambio» (muestra qué se guardaría) → «Confirmar». En *task-5* escribir una fecha inválida: el texto se conserva y el error es útil. Crear una tarea nueva.
4. **Cerrar y reabrir:** parar el proceso y reanudar con `--resume`: el estado, el diario y los cambios siguen.
5. **El CRM vuelve:** «Simular vuelta del CRM» (cambia `task-5` en el CRM). «Preparar el retorno»: tres valores (capturado/local/CRM) y conflicto. Sin decidir no se aprueba.
6. **Fallo difícil:** marcar «Perder el acuse del próximo create», aprobar y aplicar → resultado **incierto**. Reiniciar de nuevo. Probar un ID erróneo (se rechaza), buscar candidatos, conciliar con el correcto: **un solo create** en el simulador.
7. **Informe:** descargar HTML/JSON con hechos, estimaciones, pendientes y lo que el ensayo **no** demuestra.

## Pruebas

```bash
node --import tsx --test tests/rescue-room.test.ts tests/rescue-plan.test.ts tests/rescue-room-journal.test.ts tests/rescue-room-api.test.ts tests/rescue-room-client.test.ts tests/rescue-report.test.ts
```

El E2E (`tests/e2e/rescue-room.spec.ts`) necesita `PLANB_RESCUE_DIST` (interfaz compilada) y una configuración propia de Playwright con Chromium headless; lanza y mata sus propios servidores en 4521–4529. Detalle y resultados en `coordination/reports/CLAUDE-RESCUE-106.md`.

## Límites

- El simulador **no observa relaciones**: las tareas creadas en la sala no llevan referencias (el motor exige `hasRelation` para conciliar relaciones).
- La cola devuelve como máximo 200 tareas; el plan solo considera las visibles y lo declara. Los recuentos cubren todo el inventario.
- Un solo proceso escritor por carpeta; el diario no es resistente a manipulación ni acredita multiusuario.
- Ensayo cerrado ≠ negocio recuperado. Sin RTO, sin ahorro, sin dinero salvado.
