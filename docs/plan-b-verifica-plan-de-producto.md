# Plan B Verifica · Plan de producto

Nov 22, 2026 · @Hi

## La apuesta

Plan B Verifica comprueba la cartera comercial de una empresa antes de que alguien la compre, sin entregar datos personales al comprador. Primero construimos el producto completo. La venta empieza cuando pase su prueba de referencia.

**A quién se vende.** Search funds, fondos que compran pymes para integrarlas, asesores de compraventas pequeñas y despachos que revisan empresas antes de una compra. La hipótesis de empresa objetivo es una B2B de 2 a 30 M€ de facturación que lleva su cartera en HubSpot o Pipedrive.

**El problema.** Hoy el comprador recibe del vendedor cifras de oportunidades, clientes y renovación, y las da por buenas. La revisión comercial habitual no mira el CRM, y la de sistemas tampoco lo audita.

**Ejemplo (cifras ilustrativas).** Un search fund va a pagar 6 M€ por una distribuidora. El vendedor declara 2,1 M€ de oportunidades abiertas, 340 clientes activos y un 92 % de renovación. Plan B entra con acceso de solo lectura y en 72 horas entrega:

> De los 2,1 M€, 780 k€ se crearon o subieron de importe en los últimos 60 días. Hay 31 oportunidades ganadas sin factura detrás. Dos comerciales concentran el 58 %.

Cada dato va marcado como observado, declarado o sin comprobar, con la huella de la captura de la que sale.

| Momento | Qué entrega | Cómo se cobra |
| --- | --- | --- |
| Antes de firmar | Informe de verificación con huella | Por informe |
| Entre firma y cierre | Vigilancia semanal: aviso si la cartera se vacía o desaparecen contactos en bloque | Cuota mensual mientras dure |
| Después del cierre | Copia custodiada desde el primer día y migración verificada al CRM del comprador | Por proyecto |

**Lo que no tiene nadie.** La huella de la captura puede ir como anexo de las garantías del contrato, con la copia cifrada en manos de un abogado o un notario. El análisis se hace en el lado del vendedor y el comprador solo recibe conclusiones y huellas. Las dos cosas hay que validarlas con abogados.

## ¿Lo hace alguien ya?

El núcleo sí: Discern ya analiza el CRM de una empresa para los fondos que van a comprarla. Lo que nadie de lo encontrado a 22/11 ofrece es el resto: historial de cambios, cruce con facturas, sala limpia, vigilancia hasta el cierre y huella verificable.

| Capacidad | Discern | ScaleXP | Consultoras (Huble, RootMode) | Plan B Verifica |
| --- | --- | --- | --- | --- |
| Analiza la cartera del CRM para una compra | Sí | No | Sí, a mano | Sí |
| Lee el CRM directamente | Exportaciones o acceso de lectura a HubSpot y Salesforce | Sí, para su cruce | Según el caso | Sí, con huella de cada captura |
| Detecta maquillaje con el historial de cambios | No consta | No | No consta | Sí |
| Cruza oportunidades ganadas con facturas | No consta | Sí, con Xero y QuickBooks, fuera de compraventas | RootMode, en un caso concreto | Sí, con Holded |
| Sala limpia: los datos no salen del vendedor | No consta | No | No | Sí |
| Vigilancia entre firma y cierre | No consta | No | No | Sí |
| Huella verificable para el contrato | No consta | No | No | Sí |
| Migración verificada tras el cierre | Uso tras el cierre, sin migración | No | Según el caso | Sí |
| Español y facturación española | Web solo en inglés | No | En inglés | Sí |

«No consta» significa que su web no lo menciona, no que no lo tengan. Las salas de datos con IA analizan documentos, no el CRM, y las salas limpias que aparecen en búsquedas son proyectos personales.

**No podemos impedir que otros lo hagan.** Una idea no se protege, y en Europa el software es difícil de patentar. Lo que sí nos protege:

- Llegar antes con lo que Discern no tiene.
- Unas reglas de maquillaje probadas contra muchos casos, que cuestan tiempo de reproducir.
- Integraciones españolas y custodia local, poco atractivas para un competidor estadounidense.
- Una plantilla de anexo contractual acordada con abogados.
- Revisar Discern y repetir estas búsquedas cada trimestre.

## Por qué esta y no otra

La verificación de cartera cobra más por cliente, reaprovecha más código y tiene compradores más fáciles de encontrar que las otras dos vías estudiadas el 22/11.

| Vía | Competencia conocida | Precio por cliente | Código que ya existe | Cómo llegar al comprador |
| --- | --- | --- | --- | --- |
| Verificación de cartera (esta) | Discern (software para fondos, en inglés) y consultoras; ver la sección anterior | Alto: miles de euros por compra | Lectura, capturas, comparación, informe con huella, migración | Red concentrada de search funds y asesores |
| Continuidad de HubSpot (actual) | Rewind, ProBackup y la restauración de 14 días de HubSpot | Bajo, mensual | Casi todo | Agencias de HubSpot, con competidores asentados |
| Cierre de facturación (Codex) | ServiceTrade, IVP.ai y herramientas de partes conectadas a Holded | Medio: unos 500 €/mes con mucho servicio | El prototipo `billing-check`; el resto es nuevo | Miles de pymes de climatización, sector ajeno |

La competencia de las dos últimas filas está recogida en `CONTEXTO-PROYECTO.md` (22/11). El prototipo de facturación no se tira: pasa a ser el cruce de oportunidades ganadas con facturas.

## Qué lo hace potente y novedoso

El informe se puede defender: cada cifra dice de dónde sale, y el comprador la recibe sin ver un solo dato personal.

&#91;embedded content: sala limpia · qué sale del lado del vendedor y a quién llega\]

El vendedor no entrega su base de datos, sino conclusiones. La copia completa queda cifrada en manos de un tercero.

1. **Lee la fuente, no la exportación.** Una exportación la prepara el vendedor; una captura con huella no se puede retocar sin que se note.
2. **Máquina del tiempo de la cartera.** Con el historial de cambios, el informe dice qué se creó, se infló o se aplazó desde que empezó la venta.
3. **Cruce con la facturación española.** Oportunidades ganadas sin factura y clientes «activos» sin facturar en 12 meses, empezando por Holded.
4. **Sala limpia en una caja.** Funciona en un portátil del vendedor o de un tercero neutral; solo salen conclusiones y huellas.
5. **Huella comprobable por cualquiera.** Un verificador público confirma que el informe y la copia custodiada son los mismos que se firmaron.
6. **Vigilancia hasta el cierre.** Capturas semanales y aviso si la cartera se vacía o desaparecen contactos en bloque.
7. **Un lenguaje que no exagera.** Cada cifra es observada, declarada o sin comprobar; nunca «cartera íntegra».
8. **Después del cierre.** Copia custodiada desde el primer día y migración verificada al CRM del comprador.

## Qué ya está construido y qué falta

La lectura, la comparación de capturas y el informe con huella ya existen. Falta lo específico de una compraventa: las reglas que detectan maquillaje y la plantilla del informe.

| Pieza en el código | Qué hace hoy | Uso en Verifica |
| --- | --- | --- |
| `server/hubspot-read-check.ts`, `shared/crm-capture-runner.ts` | Lee HubSpot en solo lectura y valida capturas completas | Leer el CRM de la empresa en venta |
| `server/pipedrive-source.ts`, `server/zendesk-source.ts` | Lectores de otras fuentes | Empresas que no usan HubSpot |
| `shared/capture-comparison.ts`, `server/record-history.ts` | Compara dos capturas y muestra cómo estaba un registro | Qué cambió y cuándo |
| `shared/capture-quarantine.ts`, `shared/drill-schedule.ts` | Retiene capturas que encogen; programa tareas periódicas | Vigilancia entre firma y cierre |
| `shared/continuity-passport.ts`, `shared/report-brand.ts`, `shared/sha256.ts` | Hoja de afirmaciones observadas, declaradas o sin comprobar, con huella | Base del informe |
| `server/crypto.ts` | Cifrado local de la copia | Custodia y análisis en el lado del vendedor |
| `shared/migration-verifier.ts`, `shared/return-check.ts` | Compara dos exportaciones por claves confirmadas; relee el destino | Migración tras la compra |
| `shared/billing-check.ts` (prototipo sin commit) | Cruza partes con líneas de factura | Oportunidades ganadas frente a facturas |

**Lo que falta:**

- Comprobar con una cuenta real que el historial de cambios de propiedades de HubSpot llega por API. El código no lo ha validado.
- Reglas de maquillaje: oportunidades creadas o infladas en la ventana de venta, fechas de cierre aplazadas varias veces, ganadas sin factura, concentración por comercial.
- Plantilla del informe de compraventa sobre el pasaporte, con la salida seudonimizada.
- Un lector de Salesforce para empresas más grandes. No existe.

Todo esto entra en la hoja de ruta de construcción.

## Dirección de la app

Plan B pasa a ser un solo producto, Verifica. Lo que existe hoy se reparte en cuatro destinos: motor, congelado, aparcado y fuera del repositorio. Nada se borra: lo aparcado queda en el historial de git.

**El lío, en cifras (22/11).** 68 componentes de interfaz en `src`, 103 módulos compartidos, 109 del servidor, 389 archivos de prueba y unas 42.000 líneas. Hay 31 documentos en la raíz, 11 carpetas de instalaciones dentro del código, seis grupos de menú y una segunda aplicación de equipos. Codex, Claude y Copilot han trabajado a la vez con reglas distintas.

| Destino | Qué entra | Qué significa |
| --- | --- | --- |
| Motor de Verifica | Lectores de HubSpot, Pipedrive y Zendesk; capturas, comparación, cuarentena e historial; pasaporte, informes y huellas; cifrado local; verificador de migraciones; `billing-check` | Pasa a la estructura nueva y recibe todo el trabajo nuevo |
| Congelado | El CRM local para trabajar sin HubSpot: Clientes, Hoy, Agenda, Continuidad, Cambios, Exportar, devolución a HubSpot, sala y cápsula de rescate | Sigue funcionando con sus pruebas; solo arreglos. Vuelve como custodia tras el cierre |
| Aparcado | Laboratorio (Radar, Comprobar fecha, ¿Y si cae…?, Ensayar mi semana), aplicación de equipos (PostgreSQL, Google, agente de Copilot, espacio comercial) e IA local | Sale del menú y de la compilación principal; se guarda en una rama de archivo |
| Fuera del repositorio | Las 11 carpetas `planb-local-*` y `planb-hubspot-*`, `data/` y salidas de pruebas | Las mueves tú fuera del código: los agentes no pueden tocarlas |

**Estructura nueva.**

1. Una entrada propia en `src/verifica/`, con su página, como ya hace el prototipo de facturación.
2. Las reglas en `shared/verifica/`, puras y probadas contra la empresa con trampas.
3. El servidor monta solo lo que Verifica necesita; lo congelado se monta aparte, como hoy.
4. El menú sigue el trabajo: Operación, Fuentes, Capturas, Hallazgos, Informe, Vigilancia y Después.

**Reglas para no volver al lío.**

1. Una pregunta de entrada: ¿hace el informe más fiable, más rápido o más fácil de defender? Si no, no entra.
2. Manda un solo documento, este plan. Los demás pasan a ser historial.
3. Cada carpeta tiene un dueño, y nadie toca la de otro sin encargo.
4. Ningún cambio entra sin pasar la prueba de referencia.
5. Lo congelado solo recibe arreglos.
6. Un solo tablero de trabajo, con las fases de la hoja de ruta.

**Lo que tienes que decidir tú.**

- [ ] Confirmar los cuatro destinos, sobre todo aparcar la aplicación de equipos.
- [ ] Elegir qué agente coordina y quién es dueño de cada carpeta.
- [ ] Mover las carpetas de instalaciones fuera del repositorio.

## Hoja de ruta de construcción

Cinco fases de construcción y una de venta. Cada fase termina con una prueba sobre la empresa con trampas, y sin pasarla no empieza la siguiente.

&#91;embedded content: hoja de ruta · 5 fases de construcción y 1 de venta\]

No hay fechas: dependen de las horas de agentes y de revisión que dediquemos. La fase 0 va primero porque ordena todo lo demás.

## Prueba de referencia: la empresa con trampas

El producto se construye y se mide contra una empresa ficticia con seis trampas sembradas. Está listo cuando las detecta todas sin falsos avisos. Se hace en una carpeta aislada o en el portal de pruebas de HubSpot, nunca en el piloto ni con datos reales.

**Empresa ficticia.** Una distribuidora B2B con unos 300 clientes, dos comerciales, 12 meses de historia y una exportación de facturas.

| Trampa sembrada | Qué debe decir el informe | Base |
| --- | --- | --- |
| Oportunidades creadas o infladas en las últimas 6 semanas | Importe y número creados o subidos en la ventana de venta | Observado |
| Fechas de cierre aplazadas tres veces o más | Cuántas y por cuánto importe | Observado, si el historial llega por API |
| Oportunidades ganadas sin factura | Lista con importe; ambiguas aparte | Observado si coincide la referencia; sin comprobar si solo coinciden cliente e importe |
| Dos comerciales con la mayoría del importe | Concentración por comercial | Observado |
| Contactos borrados entre dos capturas | Aviso de vigilancia y captura retenida | Observado |
| Renovación del 92 % declarada por el vendedor | Qué parte se pudo contrastar con facturas | Declarado o sin comprobar |

**Formato.** La primera página da las cifras, cada una con su base y la huella de la captura. La segunda dice qué no se pudo comprobar y por qué. Ningún nombre de cliente sale del lado del vendedor.

## Cómo se venderá

Precios de referencia para diseñar el producto. No se ofrece nada a nadie hasta que el producto pase su prueba de referencia.

| Producto | Precio de lanzamiento | Precio objetivo | Qué incluye |
| --- | --- | --- | --- |
| Informe de verificación (paga el comprador) | 1.500–2.500 € | 4.000–8.000 € | Lectura, informe de dos páginas, reunión de 45 minutos, entrega en 72 horas hábiles |
| Informe para el vendedor | 1.500 € | 3.000–5.000 € | Lo mismo, encargado por quien vende para llegar a la venta con la cartera ya comprobada |
| Vigilancia entre firma y cierre | Incluida en el primer caso | 1.000–2.000 €/mes | Captura semanal, avisos e informe al cierre |
| Migración verificada | Por presupuesto | 5.000–15.000 € | Copia custodiada, migración e informe de equivalencia |

A modo de escenario, no de previsión: 30 compras al año con unos 10.000 € entre informe, vigilancia y migración son 300.000 €.

## Riesgos

El riesgo mayor es depender de compras en marcha con plazos de pocas semanas. El informe para el vendedor lo reduce, porque no espera a ningún comprador.

| Riesgo | Cómo lo cubrimos |
| --- | --- |
| Pocas operaciones en marcha y plazos cortos | Plantilla fija y entrega en 72 horas; vender también el informe para el vendedor |
| El vendedor no da acceso al CRM | Análisis en su lado sin sacar datos; versión encargada por el propio vendedor |
| Responsabilidad si el informe no detecta algo | Alcance escrito: solo se afirma lo observado en las capturas, nunca «cartera íntegra». Consultar un seguro de responsabilidad profesional antes del primer cobro |
| Datos personales y competencia | Salida seudonimizada, acuerdo de tratamiento y borrado al terminar |
| El historial de HubSpot no llega por API como esperamos | Probarlo en el portal de pruebas antes de prometer la trampa de fechas aplazadas |
| Empresas grandes con Salesforce | Empezar por HubSpot y Pipedrive; Salesforce solo con demanda pagada |
| Los abogados no aceptan la huella como anexo | El informe vale sin ella; la huella es un añadido |
| Falta red en el mundo de las compraventas | Usar agencias de HubSpot y abogados como canal cuando empiece la venta |
| Discern u otro añade historial, facturas o sala limpia antes de que salgamos | Construir primero lo que menos se copia: facturación española, custodia local y vigilancia hasta el cierre. Revisar la competencia cada trimestre |

## Fuentes

**Leídas y comprobadas el 22/11**

- [Discern · GTM Due Diligence Software](https://discern.io/gtm-due-diligence-software/). Analiza exportaciones del CRM o acceso de lectura a HubSpot y Salesforce para fondos. Su web no menciona historial de cambios, facturas, privacidad, vigilancia hasta el cierre ni huellas.
- [ScaleXP · Revenue Leakage Software for Xero and QuickBooks](https://www.scalexp.com/revenue-leakage/). Cruza oportunidades ganadas en HubSpot, Salesforce o Pipedrive con facturas de Xero o QuickBooks. No habla de compraventas.
- [RootMode · CRM Data Quality That Closes Your Exit](https://www.rootmodeconsulting.com/insights/crm-data-quality-ma-due-diligence). Caso de 2024 de una consultora de Salesforce que reconcilió datos para una venta.
- [Huble · M&A Tech Due Diligence: Assessing CRM and GTM Stacks Before You Acquire](https://huble.com/blog/ma-tech-due-diligence-assessing-crm-and-gtm-stacks). Agencia partner de HubSpot. Dice que la revisión comercial suele tomar las cifras de cartera tal como vienen.

**Vistas solo en resultados de búsqueda, sin abrir**

- [Checkpoint GTM · RevOps para fondos](https://checkpointgtm.com/services/private-equity-revops.html). Servicio que contrasta la historia de ingresos con el CRM; la página no se pudo abrir.
- [Documento de Cuatrecasas sobre search funds](https://www.cuatrecasas.com/resources/search-funds-text-67da98514d158958824592.pdf). Un resumen le atribuye 67 search funds en España en una década; la cifra está sin comprobar.
- [IESE Insight sobre la expansión de los search funds](https://www.iese.edu/es/insight/articulos/search-funds-expansion-record).
- [Euronext: qué es un clean team](https://www.corporatesolutions.euronext.com/glossary/clean-team) y [Forbes Solicitors: RGPD en compraventas](https://www.forbessolicitors.co.uk/articles/due-diligence-gdpr-factors-to-consider-for-staying-compliant-during-a-corporate-transaction).

La competencia de la continuidad y del cierre de facturación está en `CONTEXTO-PROYECTO.md`, con sus enlaces, a 22/11. Las cifras del código salen de contar archivos del repositorio el 22/11.
