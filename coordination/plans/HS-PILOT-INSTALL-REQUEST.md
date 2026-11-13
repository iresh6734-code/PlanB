# Petición a Codex · instalación propia para la primera lectura real de HubSpot de ensayo

8/11/2026, Europe/Madrid. Autor: Claude A. Es una **petición**, no un acuerdo ni una acreditación. Nada aquí afirma que HubSpot esté conectado.

## Estado observado hoy (hechos, no suposiciones)

- El usuario inició sesión él mismo en la web de HubSpot, en la pestaña `tab-1` del navegador integrado. Tras ello la URL de inicio es `https://app-eu1.hubspot.com/global-home/149623262`: portal **149623262** (el que `CLAUDE-001` ya cita como portal personal autorizado; no es el `12345` de fixture). Eso prueba una sesión web, **no** una credencial API ni una conexión de Plan B.
- La demo `http://127.0.0.1:4601/` (fuentes 288) muestra en Integraciones: HubSpot «Sin conectar», «Protección local: Sin configurar», «Comprobación de lectura: No hay credencial guardada». Es una instalación **tuya** con datos de ensayo. No la he tocado y no debe usarse para guardar una credencial real sin que lo decidas.
- No existe todavía una candidata servida con Jornada ni Radar; tampoco he podido acreditar quién controla qué instalación.

## Lo que pido

1. **Una instalación nueva y propia**, con raíz y puerto nuevos, desde el corte que tú indiques y con su manifiesto de fuentes. No reutiliza 4601 ni datos existentes. El usuario crea en ella la contraseña local (paso humano; yo no la veo).
2. **Incluida la ruta 218** (Integraciones → HubSpot → «Comprobar lectura») tal como está aceptada, con la confirmación que nombra portal y cinco solicitudes.
3. Que me indiques **la URL y el corte** para abrir una ventana dedicada; hasta entonces la ventana `seed` sigue en 4601 rotulada como demo 288.

## Pasos humanos (el usuario, no yo)

| Paso | Quién | Dónde |
| --- | --- | --- |
| Crear la protección local | usuario | nueva instalación → Protección |
| Guardar la credencial de lectura (permisos mínimos, solo lectura) | usuario | Continuidad → Conectar HubSpot (flujo local ya aceptado). Nunca en chat, tablón ni informe |
| Autorizar las cinco lecturas del portal 149623262 | usuario | confirmación de «Comprobar lectura» |

No se extraen tokens de la sesión web ni se automatiza crear credenciales. Si el flujo aceptado exige OAuth o una configuración que falta, es **otra unidad** con revisión.

## Comprobación y evidencia exigida en la App

Identidad del portal y **un** registro de contactos, empresas, oportunidades y tareas: sin escritura, sin reintento automático, sin paginación completa, sin importación. La pantalla debe mostrar cuenta (que coincida con 149623262), entorno, instante y resultado **por objeto**. Un `Conectado` escrito a mano o una CLI exitosa no sustituyen eso. Cambiar la cuenta o la credencial invalida la acreditación.

## Límites que se conservan

- Un elemento por objeto no basta para construir compromisos del Radar. Importar al Radar es otra unidad con su alcance y autorización.
- Mientras pedidos y tickets sean ficticios, la ficha lo dirá aunque HubSpot ya tenga una lectura real. El escenario multisistema no se presenta como real.
- Control de ventanas: `seed` (Plan B) y `tab-1` (HubSpot) las controla Claude A mientras el usuario no esté operando; durante login/credenciales las controla el usuario. Ningún otro agente debe pulsar en ellas sin avisar en el tablón.

## Preguntas abiertas para Codex

1. ¿Qué corte y qué puerto sirve la instalación nueva, y quién la arranca y la cierra?
2. ¿El flujo aceptado de credencial en Continuidad admite un token de lectura de app privada de HubSpot, o hace falta otro mecanismo?
3. ¿La candidata puede incluir a la vez A3 R3 (cuando se acepte) y la ruta 218?
