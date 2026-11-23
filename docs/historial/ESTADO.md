# Estado de Plan B

**Comprobado el 17/11/2026 a las 14:04 (Europe/Madrid).** Este documento dice lo que hay **hoy**, en una página. El historial completo está en `CONTEXTO-PROYECTO.md`. Lo que no se ha podido comprobar se indica como tal. Hay que actualizarlo al cerrar cada tanda.

## Dónde corre cada cosa

| Instalación | Qué es | Estado comprobado |
| --- | --- | --- |
| `http://127.0.0.1:4331` | CRM completo del usuario (datos en `planb-local-ux-2026-10-27`) | Responde: `/api/health` → `ok`, v0.6.0. La interfaz desplegada es la compilación del 17/11 a las 09:02 de la sesión Faro (copia para revertir: `runtime/backup-dist-20261117-090157`). **No incluye** el menú de cinco lugares, Deshacer ni nada presentado después. |
| `http://127.0.0.1:4334` | Piloto protegido | **No escucha.** |
| Ensayo aislado 4421 / 5199 | Pruebas de esta sesión con datos ficticios nuevos, red exterior bloqueada | Configuraciones `ensayo-api` y `ensayo-ui` de `.claude/launch.json`. Desechable. |

## Qué funciona y con qué datos

| Apartado | Datos reales | Notas |
| --- | --- | --- |
| Inicio, Hoy, Clientes (Empresas, Oportunidades, Tareas), Cambios, Exportar, Continuidad | Sí | Trabajo local sobre la copia cifrada |
| Captura de HubSpot | Solo lectura | Portal de ensayo 149623339 leído de verdad. Ningún portal propio de producción conectado |
| Deshacer el último guardado | Sí (en código) | Presentado y en revisión; no desplegado |
| Propuestas (antes «Agentes») | No | Reglas y destinos simulados |
| Laboratorio: Radar, Comprobar una fecha, Ensayar mi semana | No | Solo con datos de prueba; el servidor rechaza los reales y, en el código actual, el menú también los oculta |
| Espacio de equipo `/team`, Google Workspace, IA | No | Demo con dos empresas ficticias; nube e identidad sin desplegar; IA desactivada para datos reales |

## Cómo saber si algo se ha roto

```bash
node tools/ci/run.mjs
```

Comprueba los tipos, ejecuta la batería con `NODE_ENV=test` y la compara con `tools/ci/known-failures.json` (20 fallos conocidos, cada uno con causa y responsable). También comprueba `docs/api.md`. Solo es concluyente **con el equipo tranquilo**: con otras sesiones al 100 % de CPU aparecen fallos que no son reales. Un fallo dudoso se confirma ejecutando su archivo aislado.

- Mapa de la API: `docs/api.md`, 171 rutas generadas desde los servidores reales. Se regenera con `node tools/api/inventory.mjs`.

## Control de versiones y coordinación

- Último commit: `00261a1` (14/11). Desde entonces hay 87 archivos modificados y 83 nuevos **sin guardar en Git**, de varios agentes. No hay remoto configurado.
- Tablón: 569 encargos (249 aceptados, 281 en revisión, 16 en curso, 10 bloqueados, 13 listos). La revisión la hace Codex y sigue siendo el cuello de botella.
- Varios archivos de interfaz se editan con reservas cruzadas por autorización del usuario. Cada informe de `coordination/reports/` lleva las huellas de antes y después.

## Decisiones que siguen siendo del usuario

1. Guardar en Git el trabajo pendiente (commits locales por tema).
2. Desplegar en 4331 lo presentado después del 17/11 a las 09:02, cuando Codex lo acepte.
3. Proveedor de IA y alcance para usar datos reales (mejora C10) y portal HubSpot de producción (C11).
4. Dependencias nuevas: el 17/11 se decidió no añadir ninguna. Por eso la tipografía propia empaquetada (D6) y DPAPI sin PowerShell (F3) quedan fuera.
