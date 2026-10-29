# CLAUDE-FIX-023 · Remates R-18 (zona horaria de la ficha) y R-16 (análisis del agente en curso)

29/10/2026, Europe/Madrid. Autor: Claude (Sonnet 5.5), por petición del usuario. No toca ningún archivo que Codex tuviera reservado (`CONTEXTO-PROYECTO.md`, `server/team/oauth.ts`).

## Cambio

- **R-18 · `CustomerDossier.tsx`:** la ficha formateaba todas las fechas con `timeZone: 'Europe/Madrid'` fijo mientras sus formularios (`datetime-local`) y Comercial usan la hora local del navegador; si el equipo no está en esa zona, la hora escrita y la mostrada diferían. Ahora usa la hora local, como el resto de la interfaz.
- **R-16 · `TeamAgentWorkspace.tsx`:**
  - Mientras haya un análisis con estado `running`, la lista se recarga sola cada `pollMs` (3000 por defecto) y lo dice en pantalla. Se detiene cuando termina el último, al pausar y al desmontar.
  - Prop `paused`: `TeamApp.tsx` la conecta con `locked`, así que con la sesión caducada no se hacen peticiones (misma razón que el sondeo de Trabajos en `FIX-020`).
  - El sondeo salta si hay una operación en curso (`busy`) o si el sondeo anterior sigue en vuelo; un fallo del sondeo se ignora en silencio (no se presenta como fallo de una acción).
  - Botón «Actualizar» en «Análisis conservados» y un aviso «Operación en curso. Si tarda, puedes cambiar de sección…» mientras dure una operación.
  - **No se añade cancelación:** el servidor no tiene ninguna ruta para cancelar un análisis. Cambiar de sección no cancela nada: el resultado queda guardado en el servidor.
- Sin cambios de servidor, permisos ni contratos. El sondeo solo hace `GET` de la lectura del agente.

## Verificación

- `tsc --noEmit` sin errores. `npm test` **569/569**. `tests/ui-journeys.test.ts` 54/54 (7 pruebas nuevas).
- 30 recorridos E2E aislados (Chromium propio de Playwright, build aparte en `tests/.tmp`) correctos.
- **Línea base:** sobre los fuentes anteriores de ficha y agente fallan las pruebas de R-18 y de refresco/actualizar de R-16; la de «no sondea si está pausada o sin análisis en curso» pasa (es una guarda, el código antiguo nunca sondeaba).
- **Mutaciones sobre los archivos reales** (restaurados): ignorar `paused`, quitar la guarda `busy` y quitar la guarda de petición en vuelo fallan cada una al menos una prueba. El revisor comprobó además: no limpiar el intervalo, sondear sin análisis en curso y volver a Madrid fijo (todas detectadas).
- **Revisión independiente** (subagente distinto del autor, solo lectura): *aprobable*, sin defectos de correctitud ni de seguridad. Encontró dos huecos reales de prueba (la guarda `busy` y el aviso de operación en curso no se probaban) y un solape posible de sondeos lentos; los tres están cerrados, y se sustituyó una clase CSS que vivía en otro archivo por estilo en línea.
- Hashes SHA-256 (16 primeros): `CustomerDossier.tsx` eaa66280fd7a0e28 · `TeamAgentWorkspace.tsx` 58e0962d7c659aa1 · `TeamApp.tsx` bbd23cbe75b3797e · `tests/ui-journeys.test.ts` 3150b03d4c51f23d.

## Límites

- Con un 401 fuera del piloto local (Firebase) o con 403/5xx o sin red, el sondeo sigue cada 3 s sin aviso mientras el análisis siga «En curso»; es acotado y «Actualizar» muestra el error. No hay contador de fallos.
- Una respuesta tardía de un sondeo podría pisar datos de un `run` posterior; improbable y cosmético.
- Las pruebas son de un arnés de hooks sin React DOM: no se han comprobado StrictMode, el aspecto visual de «Actualizar» ni la carrera real entre respuestas fuera de orden.
- Siguen sin hacer **R-08** (`aria-disabled` con operación en curso) y **R-12** (combobox de clientes).
- Sin despliegue: el piloto sigue con el build anterior.
