# CLAUDE-FIX-019 · Clave de idempotencia en el cliente y remate de R-07/R-14

29/10/2026, Europe/Madrid. Autor: Claude (Sonnet 5.5), por encargo expreso del usuario. Completa en la interfaz la capacidad que `CLAUDE-FIX-016` añadió al servidor.

## Cambio

- **Comercial** (`CommercialWorkspace.tsx`): «Preparar seguimiento» envía `{contactId, id}`. El `id` es un UUID guardado por cliente en una referencia: un reintento tras un fallo o una respuesta perdida lo **reutiliza**; se **renueva** tras un éxito y cuando la persona confirma «preparar otro» ante un borrador abierto; cambiar de cliente nunca hereda la clave del anterior.
- **Ficha** (`CustomerDossier.tsx`): el `id` es estado propio (como ya hacía `operation` con las acciones), estable en el reintento y renovado tras un éxito. La ficha se monta por `empresa:contacto:fuente`, así que la clave es por cliente y origen.
- **Agente** (`TeamAgentWorkspace.tsx`): «Preparar borrador con las reglas de Plan B» envía `id` ligado a la vista previa (oportunidad + revisión del contexto); reutilizado tras un fallo, renovado tras un éxito y al cambiar de oportunidad o de revisión.
- **R-07 (remate):** «Preparar autorización Google» y «Revisar importación» explican por qué están deshabilitados con `aria-describedby` hacia un párrafo con todos los motivos (se retiró el aviso suelto duplicado de OAuth no configurado). Las condiciones de deshabilitado son **exactamente las mismas** que antes.
- **R-14 (remate):** el agente muestra una nota de solo lectura a un lector; los botones siguen deshabilitados por `!canWrite`.
- Sin cambios de servidor, permisos, contratos ni esquema.

## Verificación

- `tsc --noEmit` sin errores. `npm test` **550/550**. `tests/ui-journeys.test.ts` **47/47**; las 6 pruebas iniciales de FIX-019 **fallan sobre los fuentes anteriores** (`HEAD`) y pasan sobre los nuevos.
- **25 recorridos E2E** en Chromium aislado (mismo arnés que `FIX-014`), repetidos contra el cliente nuevo y el servidor real de demo: la ruta de servidor acepta el `id` y los recorridos que preparan seguimiento (Comercial y ficha) no cambian.
- **Revisión independiente** (subagente distinto del autor, solo lectura, 18 mutaciones): *aceptable con reservas menores*, sin regresión de seguridad (las condiciones de deshabilitado se conservan) y hooks antes de cualquier retorno condicional. Detectó 14 de 18; los 4 supervivientes eran huecos de prueba y están cerrados: el vínculo `aria-describedby` se afirma ahora de verdad (antes un id `undefined` encontraba cualquier nodo), cambiar de cliente tras un fallo, y cambiar de revisión u oportunidad en el agente. Comprobado sobre los archivos reales: cada una de esas mutaciones falla ahora al menos una prueba, y se restauraron los fuentes.
- Hashes SHA-256 (16 primeros): `CommercialWorkspace.tsx` d5f74880ccfda137 · `CustomerDossier.tsx` 6aaca7393ee9d095 · `TeamAgentWorkspace.tsx` 30057b399083e6eb · `tests/ui-journeys.test.ts` c273fa98cecf6c02.

## Límites

- Tras un fallo, la clave se retiene hasta un éxito, un cambio de cliente/oportunidad o una confirmación expresa. Si el `POST` sí se creó (respuesta perdida) y esa propuesta se ejecuta o descarta **antes** del reintento, el reintento devuelve la propuesta vieja en lugar de crear otra, porque el servidor no mira el estado. En Comercial lo cubre el aviso de borrador abierto solo mientras la propuesta siga en borrador. Es el compromiso inherente de una clave de idempotencia.
- En la ficha la clave no depende de `source.key`: si la fuente activa cambia tras un fallo, el reintento reutiliza el id (inocuo: el servidor responde 409 por fuente cambiada o crea con ese id).
- Las pruebas de componentes usan un arnés de hooks con servidor falso; el servidor real solo lo ejercitan los recorridos E2E de demo. No hay lector de pantalla ni foco real comprobados.
- **Siguen sin hacer:** R-08 (`aria-disabled` en lugar de `disabled` con operación en curso), R-12 (combobox de clientes), R-16 (progreso y cancelación del agente) y R-18 (zona horaria de la ficha); además, la caducidad de sesión (401) del piloto sigue descartando borradores sin aviso.
- Sin despliegue: el piloto sigue con el build anterior.
