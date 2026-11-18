# CLAUDE-TEAM-D8 · El espacio de equipo, al nivel de la App

**Autor:** Claude (Opus 5.5) · **Fecha:** 18/11/2026 · **Origen:** mejora D8 del informe, por orden del usuario: «mismos componentes, estados y voz; quitar el botón primario deshabilitado como única acción de una pantalla vacía».

## Cómo se midió

Se montó un ensayo aislado nuevo del servicio de equipo: `tests/.tmp/ensayo-team/start-team.mjs` y las configuraciones `ensayo-equipo` y `ensayo-equipo-ui` de `.claude/launch.json`.

- Modo demo con dos empresas inventadas, puerto 4431 y una carpeta de datos nueva.
- Directorio de trabajo propio, así que no lee `.env.local`, y red exterior bloqueada.
- La UI corre en 5198. Las peticiones a `/api/team` van a 4431.

Un guion recorrió los **4 perfiles** (Administración, Responsable, Comercial y Solo lectura) por las **8 secciones** y anotó los botones deshabilitados, las notas y los textos fuera del glosario.

## Qué se encontró

1. **Con Solo lectura, en Trabajos, Dispositivos y Equipo, la única acción era un botón primario deshabilitado sin explicación** («Comprobar sincronización», «Vincular nueva copia», «Preparar acceso»). Es exactamente el caso de D8.
2. **«Capturar en lectura» (Integraciones) estaba deshabilitado sin decir por qué**, para todos los perfiles en el ensayo, porque no hay portal conectado.
3. **La voz no era la de la App.** `docs/voz.md` dice que lo inventado se llama siempre «datos de prueba», y aquí aparecían:
   - «Ensayo local con dos empresas ficticias»;
   - «Ensayo local» en el pie del menú;
   - «contactos ficticios» y «Cargar datos ficticios»;
   - «La demo no usa…»;
   - «Ensayo con adaptadores ficticios» (en Comercial).
4. **No es un problema:**
   - «Preparar acceso» con Administración solo está deshabilitado hasta escribir un correo, que es validación de formulario;
   - «Preparar seguimiento» (Comercial) ya dice «Selecciona un cliente» y tiene el buscador al lado;
   - «Preparar autorización OAuth» ya explica que faltan credenciales del despliegue;
   - el selector del permiso de cada persona queda de solo lectura sin permiso, que es una vista, no una acción muerta.

## Qué cambió

**`src/TeamApp.tsx`:**

- **Sin permiso, una nota con quién puede hacerlo en lugar del botón.** Es el patrón que ya usaba el agente local («Administración puede configurar el modelo local.»), en un componente `NotAllowed` con icono de candado y `role="note"`:
  - Trabajos: «Administración, Responsable o Comercial pueden comprobar la sincronización.»
  - Dispositivos: «Administración, Responsable o Comercial pueden vincular una copia local.» El formulario no se muestra.
  - Equipo: «Solo Administración puede invitar a personas.» El formulario de invitación no se muestra. La lista de personas sigue visible.

  Con permiso, los botones quedan como estaban y solo se deshabilitan mientras hay una operación en curso o falta un dato.
- **«Capturar en lectura» dice por qué no se puede:** «Administración o Responsable pueden capturar desde HubSpot.» o «Conecta primero el portal de HubSpot para poder capturar.»
- **Textos según el glosario:**
  - «Datos de prueba: dos empresas inventadas para practicar…»;
  - pie del menú «Datos de prueba», igual que la App;
  - «Practica el seguimiento con contactos de prueba…»;
  - «Cargar datos de prueba» y «Contactos de prueba cargados.»;
  - «Esta prueba no usa conexiones de otras instalaciones.»

**`src/CommercialWorkspace.tsx`:** «Datos de prueba: adaptadores inventados, sin acceso a cuentas.»

**`src/team.css`:** estilo de la nota `.team-not-allowed`, con los tokens de Faro y valores de respaldo.

**Se conserva «Perfil de ensayo»** porque lo usan tres E2E ajenos (`customer-dossier-focus`, `local-agent` y `v5`) y «ensayo» no es un término retirado. Los nombres de las empresas de prueba («Equipo Arce · Ensayo») vienen de los datos de demostración del servidor (`server/team/demo.ts`) y no se tocaron. `TeamSync.tsx` (reserva CODEX-TEAM-069) tampoco.

## Verificación

- **Recorrido después** (4 perfiles × 8 secciones):
  - ninguna sección tiene como única acción un primario deshabilitado sin motivo;
  - Solo lectura ve las tres notas;
  - **ningún** texto con «ficticio», «Ensayo local» ni «la demo»;
  - cero errores de página.
- **Capturas** de Trabajos con Solo lectura en escritorio y a 390 px (sin desplazamiento lateral). Están en el scratchpad (`team-d8-*.png`, `team-*-d8.png`).
- **`tests/team-voice-d8.test.ts`, 3/3:**
  1. Ningún primario se deshabilita por permiso de trabajos, dispositivos o equipo, y las notas y las razones de captura están. La versión anterior de `TeamApp.tsx` (la del commit) tenía los tres casos, así que la prueba la habría detectado.
  2. Las notas nombran a quien de verdad tiene cada permiso según `shared/team.ts`.
  3. Ningún archivo del espacio de equipo usa los términos retirados.
- **Suites del espacio de equipo**, todas en verde:

| Suite | Resultado |
| --- | --- |
| `commercial` | 18/18 |
| `commercial-email` | 3/3 |
| `team` | 7/7 |
| `team-agent` | 6/6 |
| `team-agent-poll-race` | 6/6 |
| `team-conflict` | 2/2 |
| `team-persistence` | 1/1 |
| `team-replica-view` | 7/7 |
| `team-sync-contracts` | 8/8 |
| `team-sync-ui` | 12/12 |

- **Otras comprobaciones:** `ui-copy` 3/3, `ui-journeys` 60/60, `independent-interface-contexts` 47/47 y `tsc` 0.

## Pendiente

- **Los E2E del espacio de equipo** (`v5`, `local-agent`, `customer-dossier-focus`) necesitan el servidor compilado (`build/`), y compilar está prohibido porque pisa el piloto. No se ejecutaron. Ninguno espera los textos cambiados ni los botones que ahora no aparecen sin permiso. `v5` comprueba que «Editar teléfono» queda deshabilitado con Solo lectura, y eso no cambia.
- **Añadir «ficticio» a la prueba global de vocabulario** (`tests/ui-copy.test.ts`). Está en revisión (CLAUDE-UI-COPY-D2), así que se hará cuando se acepte.

## Huellas

| Archivo | Antes | Después |
| --- | --- | --- |
| `src/TeamApp.tsx` | `66135b47ed1e` | `3023f8ca4d04` |
| `src/CommercialWorkspace.tsx` | `0230198c9ac6` | `1f6da03df74a` |
| `src/team.css` | `005e7fde2aef` | `e30719081a62` |
| `tests/team-voice-d8.test.ts` | — | `aee9308c256b` (nuevo) |
