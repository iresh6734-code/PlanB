# Product

Actualización del 23/11/2026: el producto es **Plan B Verifica**. Lo anterior (copia de HubSpot para seguir trabajando sin conexión) es el CRM congelado: sigue en el repositorio, solo recibe arreglos y acabará siendo la «Copia de trabajo» de Verifica (mega plan 2, fase E). La descripción del 28/10/2026 está en el historial de git de este archivo.
<!-- impeccable:product-schema 1 -->
## Platform
web (página `verifica.html`, local y sin conexión) y scripts de Node sin red; el CRM congelado es una app local con servidor propio.
## Users
Quien compra una empresa B2B pequeña o mediana (search funds, fondos que integran pymes, asesores de compraventas y abogados) y quien la vende y quiere llegar con la cartera comprobada. Un operador de Plan B prepara las capturas en el equipo del vendedor.
## Product Purpose
Comprobar la cartera comercial de una empresa antes de comprarla, sin entregar datos personales al comprador. Vigilarla entre la firma y el cierre, y verificar después la migración al CRM del comprador.
## Operating Context
Windows, Node 24. El análisis se hace en el lado del vendedor, en su portátil o en uno neutral: lectura de solo lectura del CRM (HubSpot hoy), libro de facturas en CSV (Holded) y declaraciones del vendedor. Al comprador solo le llegan cifras, seudónimos y huellas; la copia completa va cifrada a quien la custodia y la llave por separado.
## Capabilities and Constraints
Seis reglas con umbrales fijos (`shared/verifica/rules.ts`): cartera creada o inflada en la ventana de venta, fechas aplazadas, ganadas sin factura, concentración por comercial, borrado en bloque y renovación declarada. Cada cifra lleva su base: observado, declarado o sin comprobar. Una barrera impide que salgan nombres, correos, NIF o IDs del CRM. Huella SHA-256 de cada documento, comprobable por cualquiera sin los datos; la huella prueba que no se ha tocado, no quién lo emitió. Sin IA, sin nube y sin varias empresas a la vez hasta tener clientes.
## Brand Commitments
Nombre Plan B Verifica, en español. Dirección visual «Dictamen» (23/11/2026): un informe pericial, fondo claro, titulares con serifa del sistema, rojo solo para lo que se sale de lo normal, verde solo para confirmar la huella, claro y oscuro. Sin fuentes descargadas: la página funciona sin conexión.
## Evidence on Hand
Motor y documentos probados con empresas ficticias (fases 1 a 4 de `scripts/verifica-pruebas.ts`) y recorridos en navegador del 23/11/2026. Lector de HubSpot probado con un HubSpot simulado; no se ha leído ningún portal real. Sin cabeceras reales de Holded, sin revisión de abogados, sin cliente ni testimonio.
## Product Principles
Afirmar solo lo observado, nunca «cartera íntegra». Los datos no salen del vendedor. Cada cifra dice de dónde sale. No inventar evidencia comercial.
