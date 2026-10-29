# Plan B v2.1 · Candidata de continuidad local

Estado a 26/10/2026: código y recorridos Chromium comprobados en Linux. **Pendiente aceptación nativa Windows en el equipo actual y una captura nueva de ensayo autorizada.** La captura histórica de las 18:36 no se ha conciliado aquí ni se recuperará del PC corporativo. La v2 anterior sigue siendo la entrega con aceptación Windows terminada. Estos ZIP v2.1 no incluyen datos operativos ni credenciales.

**Restricción del usuario:** el ordenador original es corporativo y queda fuera de alcance. Todo arranque y comprobación local se hará exclusivamente en el ordenador actual y en una carpeta nueva. No recuperar del equipo original bases, claves, sesiones ni credenciales, ni enviar tareas a sus agentes. La captura histórica permanece sin verificar aquí; se continuará con la demo o una captura nueva de ensayo.

## Abrir la candidata en Windows

1. Extrae todo el ZIP en una **carpeta nueva**, conservando la instalación v2.
2. Abre `ABRIR PLAN B.cmd` y visita la dirección local indicada en su ventana.
3. El generador incluye Agencia Norte, con datos completamente ficticios. El paquete independiente los carga desde `continuity.seed.json`.
4. Conserva la ventana y la carpeta `data/` durante el trabajo. Para cerrar, usa Ctrl+C antes de mover la carpeta.

No instales esta candidata encima de la carpeta configurada de HubSpot. No copies una base cifrada entre usuarios de Windows: utiliza exportación cifrada y su contraseña de recuperación. Las instrucciones generales de captura, protección, sesiones, recuperación y devolución están en `LEEME-V2.md` del código fuente.

## Qué añade v2.1

- Recuentos propios de cada captura: objetos, relaciones, campos y procesos comerciales.
- Diagnóstico que exige probar la misma captura y renovar el simulacro a los 30 días.
- Comprobación de teléfono, etapa, tarea completada, registros e historial después de reabrir SQLite.
- Botón **Informe para compartir**, que descarga HTML imprimible y sin recursos externos. El informe identifica captura, alcance y límites, sin fichas ni credenciales.

En el recorrido comprobado: Continuidad → Probar mi Plan B → Simulacro superado → Informe para compartir. Se comprobó el contenido descargado y su renderizado sin red en escritorio y móvil. La política de Chromium de este entorno bloquea `file://`; no se ha probado aquí abrir el archivo mediante doble clic ni una impresión física.

## Reproducir las comprobaciones

Desde la carpeta de código, con Node 24 o posterior:

```text
npm ci
npm run build
npm test
npm run test:e2e
```

El navegador predeterminado sigue siendo Microsoft Edge. Para las pruebas Linux se usaron `NODE_ENV=test`, `PLANB_PLAYWRIGHT_EXECUTABLE=/usr/bin/chromium` y `PLANB_EVIDENCE_DIR` apuntando a una carpeta nueva. Esa variable también separa las capturas y el resultado JSON de los informes históricos.

Linux solo admite claves locales de pruebas bajo `NODE_ENV=test`. Este modo no sustituye Windows DPAPI ni debe usarse con credenciales o datos empresariales.

## Verificar una captura de ensayo en el ordenador actual

Primero prepara una instalación independiente en este Windows, sin datos ni credenciales del PC corporativo. La demo ya permite avanzar sin HubSpot. Una conexión posterior debe hacerse mediante el formulario local y una cuenta de ensayo autorizada. Los accesos a una cuenta compartida pueden generar avisos de esa cuenta aunque se hagan desde otro ordenador.

Cuando esa nueva instalación tenga una captura guardada, desde su carpeta de código y con `NODE_ENV` sin forzar a `test`, ejecuta:

```text
node --import tsx scripts/verify-configured-capture.ts
```

Este script abre SQLite en **solo lectura**, sin leer la conexión ni consultar HubSpot, y selecciona la última captura guardada del portal de ensayo 149623339. Indica la carpeta **de este ordenador** con `PLANB_DATA_DIR`; `PLANB_CAPTURE_ID` permite seleccionar una captura concreta. No apuntes estos parámetros a un equipo remoto o corporativo.

Compara los dos pipelines, sus etapas, el campo de segmento y opciones, los 11 registros previstos, sus valores importados y las 15 relaciones de `scripts/hubspot-fixture.expected.json`. Resuelve los IDs de tareas por coincidencia única y registra por separado los IDs de otros registros de la captura. Si el conjunto concuerda, ejecuta el simulacro reforzado en un proceso aislado con red bloqueada. No modifica el historial operativo.

Resultado: `outputs/pruebas-hubspot-conjunto-v2.1.json` respecto al espacio de trabajo original; se puede cambiar la carpeta mediante `PLANB_EVIDENCE_DIR`. El cuerpo/tipo de tareas y los recordatorios que el conector no importa requieren evidencia de interfaz. La existencia de una captura guardada no demuestra el estado actual del portal ni una devolución real.

## Empaquetar y aceptar

Para reutilizar el runtime Windows y dependencias de la entrega v2, conservando su manifiesto y sin cambios de dependencias:

```text
python scripts/prepare-runtime-from-v2.py
npm run package:demo
```

El preparador verifica el SHA-256 del ZIP v2 y la coincidencia del lockfile. El empaquetador comprueba el formato PE del ejecutable; no renombra el Node Linux como `node.exe`. Conserva los ZIP v2 y genera los dos ZIP v2.1. Si han cambiado dependencias, el preparador se detiene y se necesita preparar un runtime actualizado.

Aceptación **en Windows**, desde la carpeta fuente original del proyecto:

```text
python scripts/verify-package.py
python scripts/finalize-delivery.py
```

El verificador comprueba edición, simulacro, reinicio tras traslado, recuperación cifrada y rechazo de contraseña incorrecta. Genera `pruebas-paquetes-v2.1.json`. Actualiza antes el informe de resultados para reflejar la aceptación real; después incorpora las evidencias y recalcula hashes con el finalizador.

Se puede comprobar la lógica de los ZIP desde Linux con `python scripts/verify-package.py --node /ruta/al/node`. Esa ejecución usa claves de test y genera **otro informe**, `pruebas-paquetes-v2.1-linux.json`: no ejecuta el `node.exe` incluido, no verifica DPAPI ni acredita los iniciadores Windows. Su exportación cifrada contiene Node Linux y no es una entrega Windows.

La instalación operativa corporativa no se actualizará. La aceptación y las siguientes versiones se realizarán exclusivamente sobre la instalación independiente del ordenador actual.

## Alcance pendiente

No se han habilitado datos empresariales, permisos de escritura ni llamadas a un proveedor IA real. Siguen pendientes la devolución auténtica de ensayo, el proveedor elegido y la validación comercial. No se prometen ventas, certificación ni SLA.
