# Herdr para Plan B

Herdr ofrece terminales persistentes locales. El tablón de Plan B sigue siendo la autoridad para asignaciones, reservas, revisión y aceptación. Una terminal en marcha no demuestra que un modelo esté trabajando. Una tarea en `working` tampoco lo demuestra. No liberar reservas simplemente porque una terminal acabe.

En Windows se instalaron Herdr App 0.1.11 y Core 0.1.16 en `C:\Users\iresh\AppData\Local\Programs`. Las herramientas del proyecto usan la sesión `planb`, con estado y configuración bajo `tests/.tmp/herdr-planb`, carpeta ignorada por Git. Ese estado puede contener pantallas y salida de terminal sin cifrar: no enviar secretos ni datos de clientes. No borrar esa carpeta mientras haya terminales ejecutándose.

Desde la raíz del checkout:

```powershell
node tools/herdr/planb.mjs status
node tools/herdr/planb.mjs board
node tools/herdr/planb.mjs read planb-board
node tools/herdr/planb.mjs test
node tools/herdr/planb.mjs wait planb-tests
node tools/herdr/planb.mjs read planb-tests
```

`board` inicia una vista de solo lectura del tablón, y `test` ejecuta las pruebas del tablón y del adaptador. Si un nombre ya existe, consultar `status` antes de iniciar otra instancia. `smoke` y `send planb-smoke TEXTO` prueban mensajería con un proceso de prueba, no con un modelo. Se creó el espacio local «Plan B · Coordinación» con una terminal que ejecuta la vista del tablón. La salida fue comprobada mediante `hc read`, y Herdr identificó el espacio y la pestaña. La captura de la ventana oculta no permitió confirmar la presentación visual final. El acceso directo normal de Herdr no selecciona por sí solo la sesión dedicada de Plan B.

`claude-concept` realiza una consulta concreta y fija, sin archivos, herramientas ni MCP, con límite de 0,25 USD y 140 segundos. Ya se ejecutó una vez; no repetirla para mostrar actividad. Guarda respuesta y métrica comunicada por la CLI en la carpeta temporal. No ofrece un canal genérico de envío ni amplía los seis archivos autorizados en `tools/duet/consult.mjs`. Cualquier otra consulta debe respetar su autorización específica y los límites de la cuenta.

La sesión dedicada necesitó `config/herdr-core/config.toml` con la ruta absoluta de Windows PowerShell para abrir una consola: el lanzamiento con `argv` falló porque Herdr buscaba `pwsh.exe` fuera del PATH de la sesión. Se creó una consola ordinaria y desde ella se arrancó la vista. La configuración está en la carpeta temporal de la sesión, no en la configuración global. No se comprobó una sesión interactiva de Codex dentro de Herdr ni un relevo automático de mensajes entre dos modelos. Herdr no proporciona aislamiento de permisos o bloqueo físico de archivos; no conectar equipos remotos y conservar el protocolo de reservas del proyecto. El reinicio del ordenador detiene los programas: Herdr no reanuda automáticamente el trabajo de los agentes.
