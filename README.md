# Plan B · Verifica

Plan B Verifica comprueba la cartera comercial de una empresa antes de que alguien la compre. Lee el CRM del vendedor sin modificarlo y entrega un informe con huella; después vigila hasta el cierre y verifica la migración al CRM del comprador. El análisis se hace en el lado del vendedor: al comprador solo le llegan cifras, seudónimos y huellas.

El motor está probado con empresas ficticias (fases 1 a 4). La validación con fuentes reales y la primera venta están pendientes. El CRM local sigue congelado y se puede abrir como «Copia de trabajo» desde Verifica.

## Documentos que mandan

- **Plan vigente:** «Plan B · Mega plan 2» (Claude Docs, 23/11/2026), que sigue al [plan de producto](docs/plan-b-verifica-plan-de-producto.md).
- **Qué falta para vender:** [Verifica · Salir a vender](docs/verifica-salir-a-vender.md).
- **Contexto y decisiones:** [CONTEXTO-PROYECTO.md](CONTEXTO-PROYECTO.md).
- **Lo pendiente:** la lista viva en [docs/mision/registro-colaboracion.md](docs/mision/registro-colaboracion.md).
- **Cómo colaboran los agentes:** [AGENTS.md](AGENTS.md), [CLAUDE.md](CLAUDE.md) y [COORDINACION.md](COORDINACION.md).
- **Qué es el producto:** [PRODUCT.md](PRODUCT.md).
- Las guías, planes y análisis antiguos están en [docs/historial](docs/historial/README.md).

## Usar Verifica

La página `verifica.html` enseña el informe, el parte de vigilancia y el informe de equivalencia, y comprueba sus huellas sin conexión. Los documentos los generan los scripts, sin red y sin sobrescribir nada:

```powershell
npx tsx scripts/verifica-ejemplo.ts <carpeta>
```

`scripts/verifica-ejemplo.ts` escribe la empresa ficticia, y su cabecera da las órdenes exactas de los pasos siguientes: `verifica-sala-limpia.ts`, `verifica-vigilancia.ts` y `verifica-migracion.ts`. Con un argumento que no reconoce, cada script responde con su forma de uso. Las cinco pruebas que deciden si Verifica sale fuera:

```powershell
npx tsx scripts/verifica-pruebas.ts
```

## El CRM congelado

`ABRIR PLAN B.cmd` arranca la instalación de este ordenador (4331) con su copia existente. Si esa instalación incluye Verifica, abre su pantalla de encargos. «Copia de trabajo» abre el CRM y «Verifica» en su navegación permite volver. Las instalaciones anteriores siguen abriendo su portada habitual.

## Desarrollar y validar

```powershell
npm ci
npm test
npm run test:safe
npm run build
```

`npm run test:safe` es la batería sin servidores ni navegador. `npm run build` escribe `dist/` y `build/`: no lo ejecutes sobre una instalación en uso. Las pruebas de navegador (`npm run test:e2e`) levantan instancias aisladas con la red externa bloqueada.

GitHub sincroniza código y documentación. **No sincroniza carpetas de datos, bases SQLite, capturas, contraseñas ni sesiones.** Antes de un `git pull`, comprueba que el árbol está limpio y usa `--ff-only`. El ordenador corporativo original queda fuera del alcance.
