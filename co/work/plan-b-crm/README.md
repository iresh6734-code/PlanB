# Plan B CRM · v0.3.0

Continuidad local para un operador, un portal HubSpot por carpeta y hasta 10.000 registros. Windows y Node >=24 para desarrollo. Producción autorizada exclusivamente en lectura; recuperación manual verificada. Candidata a piloto: no hay devolución auténtica de ensayo ni aceptación humana autónoma acreditadas.

Documentación vigente: [guía v0.3.0](LEEME-v0.3.0.md), [contexto y pendientes](CONTEXTO-PROYECTO.md), [plan de piloto](PLAN-V0.3.md), [análisis y próximas funcionalidades](ANALISIS-PROYECTO-2026-10-26.md). Las guías v2/v2.1 conservan contexto histórico.

## Desarrollar en otro ordenador autorizado

En un clon completo de GitHub, el código está en `co/work/plan-b-crm/`. Esta copia local de trabajo puede tener directamente esa carpeta como raíz; comprueba dónde está `package.json`.

```powershell
git clone https://github.com/iresh6734-code/PlanB.git
cd PlanB/co/work/plan-b-crm
npm ci
npm run build
npm start
```

Para recibir cambios en un clon que conserve el historial del remoto:

```powershell
git status
git pull --ff-only origin main
npm ci
npm run build
```

Para compartir tus cambios, revisa primero el diff y los archivos que vas a incluir; después haz commit y push desde la rama en la que trabajes. No copies estos comandos a ciegas sobre un checkout con historial distinto o trabajo pendiente; consérvalo y concilia antes. No uses force push para sincronizar ordenadores.

GitHub sincroniza código y documentación mediante commits/push/pull. **No sincroniza automáticamente carpetas, bases SQLite, capturas, contraseñas, sesiones o cambios CRM locales.** Para recuperar datos de Plan B en otra instalación usa una exportación cifrada y la contraseña por separado; DPAPI es propio del usuario Windows. Cada instalación debe tener su configuración autorizada.

El ordenador corporativo original queda fuera del alcance. No usar sus perfiles, datos, credenciales, servicios ni agentes.

## Validar

```powershell
npm test
npm run build
npm run test:e2e
```

E2E usa Edge por defecto. Para Chrome instalado, define `PLANB_PLAYWRIGHT_EXECUTABLE` con su ruta. Las pruebas levantan una instancia aislada en 4337 con red externa bloqueada. No apuntarlas a una instalación operativa.

Las carpetas `delivery/`, `data/`, instalaciones locales, dependencias y evidencias temporales no forman parte de la fuente publicada. Los archivos históricos en `co/outputs/` no son entregas de v0.3.0. Publicar código no actualiza ni reinicia instalaciones abiertas.
