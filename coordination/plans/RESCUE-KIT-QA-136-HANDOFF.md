# RESCUE-KIT-QA-136 · Traspaso para Codex: criterios de una integración futura del Kit de Relevo

> **Actualización R2 (4/11/2026):** este traspaso se redactó sobre 116 R2 (2/11). 116 **R4 está aceptada** (dictamen 175) y añade un `owner` por instancia; el §5 se ha reescrito con el estado vigente y lo que era un «hallazgo pendiente» queda como historia. El resto de criterios (§1–§4, §6–§8) no cambia. La aceptación de 116 no acepta esta QA.

02/11/2026. Autora de CLAUDE-RESCUE-KIT-QA-136 (misma autora que 116: esto es QA propia ampliada, **no** revisión independiente). Nada de esto se ha ejecutado ni montado. Cada punto exige su propio encargo con reserva y revisión.

## 1. Reservas y rutas que habría que acordar para un montaje

| Ruta | Cambio | Quién la reserva hoy |
| --- | --- | --- |
| `src/ContinuityHome.tsx` (o la ruta de «Ensayo de caída») | entrada «Relevo» con montaje diferido de `RescueCapsule` | reservas de la App: no tocar sin encargo |
| `server/app.ts` / `server/main.ts` | registrar `createCapsuleServer` **solo** en el servidor local de ensayo | Codex |
| `src/rescue-capsule.css` | pasar a los tokens de la App (hoy estilos propios) | 116 |
| `package.json` | scripts `rescue:kit` y `rescue:kit:rehearse` | Codex (no lo tocamos) |
| `server/rescue-capsule.ts` | exclusión entre equipos/contenedores (el `owner` de R4 resuelve instancias del mismo equipo, no otros equipos; ver §5) | 116 |

La API, la demo y el CLI no deben montarse en `server/team`.

## 2. Funciones exclusivamente de ensayo y cómo se identificarían en la interfaz

- «Sembrar origen del ensayo» (`seed-origin`), el fallo «perder el acuse», el CRM simulado y todo el kit mientras el remoto sea `simulation`.
- Identificación: banner fijo «Ensayo · datos ficticios · mismo equipo, carpeta nueva» (ya existe), insignia en la cabecera, prefijo visible en los nombres de carpeta (`rescue106-`/`rescue116-`) y ninguna acción que pueda confundirse con una operación real. Un portal real **no** debe ofrecer estos controles; la API debe rechazar orígenes con `isTestData: false`.

## 3. Integridad, cifrado y autenticidad (no son lo mismo)

- **Integridad:** huella por componente y del conjunto, coherencia cruzada y `restoreBundle` en memoria. Detecta alteración *accidental* y la mayoría de las intencionadas **solo si el atacante no recalcula las huellas**.
- **Cifrado:** `encodePortable` (scrypt + AES-GCM). Protege la confidencialidad con la contraseña del ensayo y autentica el cuerpo cifrado. **Hallazgo QA-136:** el relleno base64 `==` del salt no está autenticado; alterarlo se acepta al leer pero cambia el SHA-256 del archivo y la aprobación ligada al contenido lo rechaza (`CONTENT_CHANGED`). Tras un recálculo malicioso con la contraseña, nada impide fabricar una cápsula válida.
- **Autenticidad:** **no existe**. Un hash o una cápsula descifrable no demuestran quién la creó. No presentarlo así. Haría falta firma con clave de procedencia y un canal para distribuirla, fuera del alcance.

## 4. Contraseña, tamaño, destino nuevo, incertidumbre, aprobación retirada y simulador

- **Contraseña:** solo en el cuerpo de la llamada o por STDIN; nunca en URL, cabeceras, argumentos, logs ni errores (comprobado en 116). Una contraseña de ensayo de 12–200 caracteres no es gestión de claves: para datos reales haría falta política de claves y recuperación.
- **Tamaño:** máximo 64 MiB, comprobado **antes** de leer/descifrar; medido 6,4 MiB a 10.000 registros (sin SLA). El plan considera como máximo 200 tareas y el diario 5000 hechos (4999 efectivos).
- **Destino nuevo:** siempre una carpeta nueva con `workspaceId` nuevo; nunca se sobrescribe. Una cápsula se importa **una sola vez** (reclamo). Los destinos publicados nunca se borran solos.
- **Incertidumbre:** lo `uncertain` se conserva como incierto; nada se reenvía; el create perdido se concilia con el ID correcto y deja un solo create.
- **Aprobación retirada:** una aprobación de plan no sobrevive al relevo (vuelve a revisión); el fallo armado se desarma; las claves de idempotencia del origen quedan solo como historia.
- **Simulador:** no observa relaciones ni límites de la API real; lo que pase en él no se extrapola.

## 5. Estado del reclamo de importación (vigente: 116 R4 aceptada, QA-136 R2)

**Historia (se conserva):** QA-136 reprodujo sobre la entrega original defectos corregidos en R2: reclamo borrado tras un fallo posterior a publicar (segundo destino), carrera de recuperación de un reclamo obsoleto (duplicado en 11 de 20 rondas con dos hilos) y barrido de staging que vaciaba una importación activa. Sobre 116 R2 reprodujo además un **artefacto del PID compartido** (dos instancias del módulo en un proceso: la segunda recuperaba como obsoleto el reclamo activo de la primera) y señaló que la regresión «CARRERA» de 116 era sensible a esa estructura. R3/R4 añadieron un `owner` por instancia y la sustitución atómica del reclamo (dictámenes 138/150/153/175).

**Vigente sobre R4** (probado en esta unidad; ver informe §0bis): se distinguen cuatro estados del reclamo `importing`:

| Estado | Decisión | Cobertura |
| --- | --- | --- |
| Owner activo de la misma instancia | ocupado (`ALREADY_IMPORTED`), no se recupera | caso 1 (procesos) y guarda `activeClaims` |
| **Owner distinto con PID vivo** (incluye el mismo PID) | ambiguo ⇒ **rechazo sin tocar nada** | **caso 8 nuevo** (mismo PID) y caso 4 (PID ajeno vivo) |
| PID ausente + destino verificado no publicado | se recupera bajo exclusión y se importa **una** vez | caso 4 (sin destino) y carrera de 20 rondas (caso 5) |
| Destino publicado o dudoso | se consolida sin importar de nuevo, o `IMPORT_AMBIGUOUS` con el reclamo intacto | casos 3, 3b y 4 |

El reclamo se sustituye siempre de forma atómica (nunca queda ausente) y el error de recuperación es de dominio (`CLAIM_RECOVERY_FAILED`/`CLAIM_CHECK_FAILED`).

**Límites que siguen** (no los resuelve el `owner`): el `owner` y el PID **no son autenticación** ni exclusión entre ordenadores o contenedores (un PID reutilizado se ve «vivo» y bloquea); no se protege frente a escritores que no cooperan (otro programa que edite el reclamo); un `.takeover` o reclamo ilegible abandonado exige retirada manual; no se probó disco lleno ni corte de energía. En un entorno multiequipo hay que sustituirlo por una exclusión real.

## 6. Enlaces simbólicos

**No se pudieron crear enlaces simbólicos en este equipo** (`EPERM` sin privilegios). Las defensas contra enlaces (cápsula que es un enlace, carpeta de ensayo o ruta que atraviesa uno) **no se han probado con enlaces reales** en 116 ni en QA-136; el código las rechaza por `lstat`, pero eso es inferido de la lectura, no demostrado. Si se integra, probarlo en un entorno que permita crearlos (o con uniones de directorio en Windows) antes de afirmar nada.

## 7. Lo que falta y no se ejecutó (requiere unidad y autorización propias)

- **Otro ordenador y otro sistema operativo:** rutas, mayúsculas/minúsculas, atributos de solo lectura (aquí se usó para inyectar fallos), semántica de `rename` sobre existente, relojes y zonas horarias. Todo lo probado es Windows 11 y Node 24 en un equipo.
- **HubSpot real y relaciones:** nada de lo hecho toca HubSpot; el simulador no observa asociaciones. Hace falta una unidad con portal de ensayo y permisos de lectura.
- **Datos reales y recuperación:** ninguna prueba usa datos reales; no se mide RTO/RPO ni recuperación de negocio.
- **Concurrencia entre procesos de verdad en el mismo equipo con carga:** las pruebas usan hilos reales y procesos con barreras, pero no un estrés prolongado.
- **Otros navegadores y lector de pantalla:** solo Chromium headless-shell.

## 8. Accesibilidad, teclado y dimensiones cuando se integre

- Ya verificado en el arnés (DOM real): recorrido completo por teclado, foco al encabezado del paso y a la alerta de error, objetivos ≥ 44 px, sin desbordamiento horizontal a 1440, 390 y 320 px, contraseña vaciada al enviar.
- Al integrar hay que **repetirlo con las dimensiones y el marco reales de la App** (cabecera, navegación, zona de scroll), con Edge y un lector de pantalla, y revisar el contraste con los tokens de la App.
- Mensajes nuevos de R2 (`IMPORT_PUBLISHED_UNCONFIRMED`, `IMPORT_AMBIGUOUS`, `CLAIM_UNREADABLE`, `CLAIM_RECOVERY_BUSY`) se muestran hoy como texto del error; falta diseñar su presentación y la acción recomendada (qué carpeta abrir, cuándo reintentar).
