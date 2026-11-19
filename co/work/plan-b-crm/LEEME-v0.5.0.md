# Plan B · 0.5.0 · Equipos y sincronización

26/10/2026, Europe/Madrid. Implementación preparada y probada localmente. La aceptación en Google Cloud y la conexión OAuth auténtica siguen pendientes; esta entrega no las acredita.

## Qué se puede probar

- Consola `/team` con empresas separadas, cuatro roles y acceso por correo verificado. En producción se verifica el token de Identity Platform y su revocación; los roles se leen de la base, nunca del navegador.
- PostgreSQL con aislamiento por empresa en registros, eventos, dispositivos, operaciones, conflictos, conexiones, capturas, trabajos y auditoría. Las transacciones cambian a un rol sin privilegios de bypass y aplican RLS. El catálogo de identidades/membresías es interno al backend, con consultas autorizadas explícitas.
- Cola persistente: un trabajo simultáneo por empresa, reserva de 150 segundos, máximo tres intentos y recuperación tras reinicio. Las capturas tienen un máximo de 100 segundos de lectura; el resultado solo se guarda si el ejecutor conserva la reserva. Cloud Tasks es transporte; PostgreSQL conserva el trabajo y su deduplicación.
- Vinculación revocable de una copia local. Clave aleatoria mostrada una vez, hash en el servidor, copia cifrada mediante el almacén local y DPAPI en Windows. Cambiar permisos revoca los dispositivos del miembro.
- Edición local pendiente, intercambio explícito, reintento idempotente, revisiones y conflictos. Resolver exige revisar la versión remota actual. Una respuesta perdida después del commit no duplica el cambio.
- Adaptador OAuth HubSpot de lectura: estado de un solo uso ligado a persona/empresa/portal, tokens cifrados, renovación y comprobación del portal. La primera captura instala datos; las posteriores se guardan aparte. Retirar la conexión elimina la credencial de Plan B y detiene capturas pendientes; la retirada del consentimiento en HubSpot se hace también allí.

La consola inicial muestra contactos y edición de teléfono. La API valida los cuatro objetos y sus referencias. La réplica se conserva **separada del CRM activo**: no reemplaza capturas, no devuelve cambios a HubSpot y no cambia el comportamiento del runtime portátil. La sincronización queda bloqueada durante una sesión de continuidad; fuera de ella requiere pulsar «Sincronizar ahora». No hay automatización de envíos externos.

## Demo independiente en este ordenador

Se prepara una instalación nueva `planb-local-v0.5.0-2026-10-26`, sin usar bases ni credenciales de otras instalaciones. La consola de equipo usa PostgreSQL embebido PGlite en disco y dos empresas ficticias: Arce y Faro. No equivale a un despliegue Cloud SQL.

Para iniciar desde la fuente con Node 24 o posterior:

```powershell
npm ci
npm run build
$env:PLANB_TEAM_DEMO='1'
$env:PLANB_TEAM_PORT='4328'
$env:PLANB_TEAM_DATA_DIR='data/team-demo'
npm run start:team
```

En otra terminal, para la copia local, configurar `PLANB_TEAM_ORIGIN=http://127.0.0.1:4328`, `PLANB_TEAM_DEMO=1`, un `PLANB_DATA_DIR` nuevo y `PLANB_PORT=4327`, y ejecutar `npm start`. El modo demo escucha solo en loopback y está bloqueado con `NODE_ENV=production`.

Recorrido: cambiar empresa/perfil y comprobar permisos → encolar comprobación → crear vinculación en Dispositivos → proteger la copia local con contraseña propia → pegar origen, empresa y clave → editar sin conexión → sincronizar → revisar conflictos desde Dispositivos. La clave no debe guardarse en documentación, capturas ni chat.

Límites del piloto: 10.000 registros por empresa; cien operaciones locales pendientes; intercambio paginado de 500 eventos. La vista de copia local presenta hasta cien filas. Las pruebas usan datos ficticios; no se han trasladado datos empresariales ni las credenciales del ensayo anterior.

## Nube y aceptación pendiente

[Configuración, coste y procedimiento GCP](infrastructure/gcp/README.md). Terraform validado, sin `plan` contra una cuenta ni `apply`. La configuración crea recursos facturables solo cuando se aplique expresamente. La identidad real, Cloud Tasks/OIDC, Cloud SQL, la imagen de contenedor y OAuth requieren una prueba integrada en el proyecto autorizado. Docker está instalado pero su motor no estaba disponible para construir la imagen en esta tarea.

Antes de aceptar 0.5 en nube: dos cuentas humanas y dos empresas aisladas; pruebas de permisos revocados; reinicio/desconexión; cola con entregas repetidas; OAuth en portal de ensayo propio; registro del resultado sin secretos. La devolución auténtica histórica y la aceptación humana del producto siguen siendo evidencias independientes.

## Verificación reproducible

```powershell
npm test
npm run build
$env:PLANB_PLAYWRIGHT_EXECUTABLE='C:\Program Files\Google\Chrome\Application\chrome.exe'
npm run test:e2e
```

Las pruebas levantan servidores aislados en 4337 y 4341, con tráfico externo bloqueado. Incluyen RLS sin filtros explícitos, roles, OAuth simulado, deduplicación, conflictos, revocación, PostgreSQL en disco y réplica cifrada tras reinicio. PGlite ejecuta PostgreSQL embebido; no demuestra alta disponibilidad ni conectividad del servicio gestionado.

Se actualizaron Zod 4 y el servidor de archivos para resolver avisos de dependencias. La validación del navegador usa Zod sin generación dinámica de código para respetar CSP. No se ha publicado esta fuente ni actualizado ninguna instalación anterior.

Resultado actual: **136/136** pruebas de lógica/API, **12/12** recorridos Chrome, compilación correcta, Terraform válido y **0 avisos en npm audit**. Evidencias en `C:/Users/iresh/.codex/visualizations/2026/10/26/01a179cf-4d25-75a0-9cab-061933f2b4d8/v0.5.0/`. No se han ejecutado pruebas de cuentas reales, Cloud SQL gestionado, imagen Docker ni ZIP nuevos.
