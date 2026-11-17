# CLAUDE-API-CLIENT-ROUTES · El cliente solo llama a rutas documentadas

**Autor:** Claude (Opus 5.5) · **Fecha:** 17/11/2026 · **Origen:** mejora B5 del informe («prueba que falla si aparece una ruta sin documentar»), por orden del usuario.

## Qué hace

`tests/api-client-routes.test.ts` comprueba que cada llamada que hace la interfaz al servidor va a una ruta que existe y está en `docs/api.md`. Ese inventario lo generan los servidores reales con `tools/api/inventory.mjs`. Así, si alguien renombra una ruta, escribe mal una dirección o llama a una ruta sin documentar, la prueba falla y dice el archivo, la línea y la dirección.

Cómo funciona:

- Lee las 171 rutas de `docs/api.md`. Los `:parámetros` aceptan cualquier segmento.
- Recorre `src/` buscando dos tipos de llamada:
  - las de los ayudantes de `src/api.ts` (`api`, `post` y `download`, que anteponen `/api`). Solo cuentan si el archivo los importa de ahí, porque hay módulos con su propio `post` y otra base;
  - las cadenas literales que empiezan por `/api/`.
- Si la dirección se construye por partes, comprueba su parte fija como prefijo de alguna ruta.
- Hoy analiza **95 llamadas en 32 archivos**: 65 con la dirección completa y 30 por prefijo.

Mantiene dos listas explícitas:

| Lista | Contenido | Protección |
| --- | --- | --- |
| `PENDING_DOCS` | Las 2 rutas de importar CSV. Existen, pero `docs/api.md` se regenerará cuando se acepte CLAUDE-API-INVENTORY. | Una prueba falla si alguna ya está documentada, para que la lista no se quede vieja. Ya detectó que `undo-last` sobraba en ella. |
| `NOT_INVENTORIED` | `/api/team/local-pilot`, `/api/capsule` y `/api/rescue`. | Las excluye a propósito el propio `docs/api.md` en sus «Límites»: piloto local y servidores propios de la sala y la cápsula de rescate. Cada una lleva su motivo. |

## Resultado

**4/4** con el código actual:

- se leen las rutas;
- todas las llamadas van a rutas documentadas;
- la lista de pendientes está al día;
- el detector reconoce las cinco formas de llamada y rechaza una ruta inventada.

`tsc` 0.

En la primera pasada salieron 9 avisos. Uno era un falso positivo del propio detector, en `local-task-intents-client.ts`, que tiene su `post` con base `/api/v7/task-intents`; se corrigió exigiendo la importación desde `src/api.ts`. Los otros 8 eran las exclusiones conocidas del inventario. **No apareció ninguna llamada rota.**

## Límites

- No ve direcciones compuestas por completo en variables, como `base + path` en clientes propios. Esas solo se comprueban si contienen una cadena `/api/...` literal.
- No comprueba el método (GET o POST), solo la dirección: el inventario lo tiene, pero muchas llamadas pasan el método por una variable.
- La otra mitad de B5, la fachada `/api/v8` estable, no se hace aquí. Es una decisión de diseño de Codex.

## Nota de proceso

El archivo de la prueba se escribió **antes** de registrar el encargo en el tablón. El orden correcto es reservar y luego editar. Se registró, reservó y comprobó en cuanto se vio. El archivo es nuevo y no pisa nada de nadie.

## Archivos

- `tests/api-client-routes.test.ts` (nuevo).
- Este informe.
