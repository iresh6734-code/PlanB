# Plan B · Base Google Cloud 0.5

Actualización 0.6, 27/10/2026: `enable_workspace=false` mantiene Google Workspace desactivado por defecto. Al configurarlo expresamente, Secret Manager suministra `planb-google-client-id`, `planb-google-client-secret` y la clave AES compartida; el callback es `API_URL/team/oauth/google/callback`. Se añaden las APIs de Gmail/Calendar/Drive/Docs/Sheets y se excluyen del log de peticiones ambos callbacks OAuth. Ejecutar la migración actualizada antes de usar Comercial. [Alcance y validación 0.6](../../LEEME-v0.6.0.md). Sin despliegue ni consumo contratado por esta actualización.

Configuración preparada el 26/10/2026, Europe/Madrid. **No aplicada.** `terraform init -backend=false`, `terraform fmt -check` y `terraform validate` superados con proveedor Google fijado en `.terraform.lock.hcl`. No hay evidencia de despliegue ni consumo cloud de esta tarea.

## Recursos y alcance

Región `europe-west1`: API y ejecutor Cloud Run, PostgreSQL 16 Cloud SQL, Secret Manager, Cloud Tasks y Scheduler. Registro de imágenes en la región; bucket privado en EU reservado para archivos futuros, todavía sin API de documentos. Base por defecto de 2 vCPU/7,5 GiB, 20 GB SSD, alta disponibilidad regional, copias y recuperación a un momento dado. Protección contra borrado. Cloud Run escala de cero a tres instancias por servicio; pool máximo de cinco conexiones por proceso. Verificar cuotas de la cuenta antes de aplicar.

El ejecutor tiene IAM privado. Cloud Tasks y Scheduler usan OIDC con cuenta exclusiva; la API verifica identidad del ejecutor, además de la autorización por empresa de las peticiones humanas. La API pública solo entrega datos a miembros autenticados. El modo demo no se admite en producción. La migración crea tablas/roles y no se ejecuta automáticamente al iniciar cada réplica.

Los secretos **no contienen versiones ni valores en Terraform**. No introducir contraseñas en `tfvars`, terminal compartida, estado Terraform, logs o Git. Los callbacks OAuth se excluyen del log de peticiones para evitar registrar el código temporal. Las respuestas incluyen identificador de petición y errores saneados.

## Estimación previa a contratar

Rango orientativo para un piloto pequeño, **no presupuesto cerrado ni tarifa exacta de Bélgica**. Supuestos: 730 horas de base, 2 vCPU/7,5 GiB, SSD inicial 20 GB, poco tráfico y archivos, Cloud Run con unas 40 horas activas mensuales por servicio y sin mínimo de instancias. No se presuponen créditos ni franquicias disponibles en la cuenta.

| Componente | Orden de coste USD/mes |
| --- | --- |
| Cloud SQL regional, almacenamiento y copias iniciales | 200–280 |
| API/ejecutor con uso bajo, registro de imágenes, secretos, tareas, programación y archivos iniciales | 5–20 |
| Reserva de planificación con alta disponibilidad | **200–300** |
| Alternativa zonal para ensayo, sin alta disponibilidad | **110–160** en total, a recalcular |

Son hipótesis de planificación derivadas de las tarifas públicas, no resultados de facturación. Región, operaciones, almacenamiento creciente, logs y red alteran el total. No incluyen IVA, dominios, soporte, planes HubSpot/Workspace, IA ni ampliación del límite preventivo de IA de 25 USD. Las tarifas gratuitas de Tasks se agregan por cuenta y las operaciones cuentan por bloques de 32 KB. Confirmar precio regional y moneda con la calculadora y configurar avisos presupuestarios antes de aprobar un `apply`; un aviso no limita por sí solo el gasto.

Fuentes oficiales: [Cloud SQL](https://cloud.google.com/sql/pricing), [Cloud Run](https://cloud.google.com/run/pricing), [Cloud Tasks](https://cloud.google.com/tasks/pricing), [calculadora Google Cloud](https://cloud.google.com/products/calculator). La propuesta mantiene capacidad y recuperación como prioridad; no crea compromisos de uso ni compras anticipadas.

## Procedimiento cuando se autorice el proyecto y el coste

1. Elegir proyecto GCP y facturación autorizados. Identificar operador de despliegue; no reutilizar credenciales corporativas del ordenador excluido. Autenticación ADC mediante herramientas oficiales en el equipo actual. Preparar estado Terraform remoto con acceso restringido y versionado antes de un uso compartido.
2. Revisar `terraform plan` para `project_id` y `region`, con `enable_services=false`. **Aplicar esta fase ya crea Cloud SQL y otros recursos facturables**, aunque no inicie la API. Revisar y aprobar el plan concreto antes de aplicarlo.
3. Crear el usuario PostgreSQL dedicado `planb_owner` desde la consola segura; necesita crear tablas y el rol `planb_scoped` durante la migración. El proceso normal realiza las operaciones de datos bajo `SET LOCAL ROLE planb_scoped` y RLS. No dar acceso SQL directo a usuarios de producto. Guardar la URL de conexión como versión de `planb-database-url` en Secret Manager, usando socket `/cloudsql/PROJECT:REGION:INSTANCE`. Formato estructural: `postgresql://USUARIO:CONTRASENA_CODIFICADA@localhost/planb?host=/cloudsql/CONEXION`; no pegar el valor real en chat. Cloud Run usa su conector y el rol `cloudsql.client`; no abrir redes autorizadas de acceso PostgreSQL público.
4. Habilitar Identity Platform/Firebase Authentication en ese proyecto, registrar una app web y activar proveedor Google. Copiar únicamente la configuración web pública, restringir la API key a las APIs y dominios apropiados. La clave pública identifica el proyecto; la API exige tokens válidos, correo verificado y membresía. [Verificación oficial de ID tokens](https://firebase.google.com/docs/auth/admin/verify-id-tokens).
5. Construir `Dockerfile.team` y publicar una imagen con etiqueta inmutable en el registro del proyecto. La imagen no debe incluir `.env`, bases, instalaciones locales ni credenciales. El `.dockerignore` permite solo las fuentes necesarias. Esta tarea validó el build de Node, no una imagen Docker ejecutada.
6. Configurar `enable_services=true`, `image` y `firebase_api_key`; `enable_hubspot=false` inicialmente. Crear servicios con origen provisional, consultar `api_url`, fijar `public_origin` a esa URL HTTPS y volver a desplegar. Mientras el origen sea provisional, el navegador rechazará las operaciones con Origin; no rebajar ese control para completar el arranque. Autorizar el dominio real de API en Firebase. El ejecutor utiliza el mismo origen de producto; su OIDC usa su URL `run.app` propia.
7. Ejecutar una vez el trabajo `planb-team-migrate` antes de abrir el acceso de prueba. Comprobar `/api/team/health`; no se interpreta una página estática como base lista. Registrar la revisión de imagen/migración y probar reinicio con datos ficticios.
8. Crear una app OAuth HubSpot propia, callback exacto `API_URL/team/oauth/hubspot/callback`, permisos de lectura del código. Guardar client ID, client secret y clave AES de 32 bytes en Secret Manager; habilitar OAuth en Terraform. Usar un portal de ensayo autorizado y completar el consentimiento desde la consola Plan B. [OAuth HubSpot](https://developers.hubspot.com/docs/api-reference/auth-oauth-v3/guide). Ninguna clave de otra instalación se hereda.
9. Ejecutar la aceptación de dos empresas, identidades y dispositivos reales de ensayo, cortes de red, permisos revocados y repetición de entregas. Comprobar Scheduler, Tasks, cuenta OIDC y captura remota verificada. Guardar evidencia sin tokens ni datos de clientes.

Variables runtime: `DATABASE_URL`, `GOOGLE_CLOUD_PROJECT`, `PLANB_TEAM_PUBLIC_ORIGIN`, configuración pública Firebase y, si se habilita, secretos OAuth/AES. `PLANB_TEAM_WORKER_URL`, `PLANB_TEAM_WORKER_ACCOUNT` y cola se configuran por Terraform. Para el cliente local: `PLANB_TEAM_ORIGIN` debe coincidir exactamente con la URL autorizada; HTTPS obligatorio fuera del ensayo loopback.

## Recuperación y límites pendientes

La cola es una bandeja persistente en PostgreSQL. Scheduler vuelve a despachar trabajos pendientes; reservas caducadas se recuperan y los resultados duplicados no se aplican dos veces. Con un trabajo de captura fallido, la captura y registros activos previos se conservan. La conexión retirada invalida las capturas pendientes. Nunca se escriben objetos de HubSpot en esta fase.

Antes de producción: ensayar restauración Cloud SQL/PITR y rotación de la clave AES con migración de credenciales; medir 10.000 registros en servicio gestionado; verificar el comportamiento del navegador con identidad real y las políticas organizativas de IAM. La rotación de AES no se puede hacer cambiando solo el secreto porque los tokens existentes dejarían de descifrarse. Mantener la imagen anterior para revertir aplicación; no borrar tablas para revertir código. No presentar este esqueleto como operación de producción aceptada.
