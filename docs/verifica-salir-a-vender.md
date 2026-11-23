# Verifica · Salir a vender

Fase 5 del [plan de producto](plan-b-verifica-plan-de-producto.md), que sigue mandando. Si este documento y el plan se contradicen, vale el plan. Aquí está lo que hace falta para la primera conversación con alguien de fuera. Los precios no se repiten: están en el plan, sección «Cómo se venderá».

## 1. Antes de hablar con nadie de fuera

Nadie de fuera ve el producto hasta que pase sus cinco pruebas. Se comprueban con un solo comando, sin red y sin escribir nada:

```
npx tsx scripts/verifica-pruebas.ts
```

Si pasan las cinco, sale con código 0. Si alguna no pasa o está pendiente, sale con 1. Con `--json` da el mismo resultado en JSON.

| Fase | Criterio del plan | Estado a 22/11/2026 |
| --- | --- | --- |
| 0 · Ordenar | Un solo producto en el menú y la prueba de referencia escrita | **Pendiente de declarar:** la referencia está escrita y lo aparcado ya salió del menú (22/11/2026). Queda el CRM congelado: 5 grupos y 13 entradas, iguales con datos de prueba y reales. `--single-product` solo lo pasa quien lo decida |
| 1 · Motor | Detecta las seis trampas sin falsos avisos | Pasa con la empresa ficticia |
| 2 · Informe y sala limpia | Un tercero comprueba la huella sin acceso a los datos | Pasa con la empresa ficticia |
| 3 · Vigilancia | Borrar contactos dispara la alerta | Pasa con la empresa ficticia |
| 4 · Después del cierre | La migración de prueba no tiene diferencias en alcance | Pasa con la empresa ficticia |

Que pasen las cinco no basta. Antes de la primera conversación también hace falta:

- [ ] Las cinco pruebas pasan (`scripts/verifica-pruebas.ts` sale con 0).
- [ ] El lector de HubSpot está validado en el portal de pruebas, con historial (pasos en el registro, «Verifica · Fase 1»).
- [x] Hay un lector para el portal del cliente (23/11/2026): `scripts/verifica-hubspot.ts --client-authorization`, solo cuentas STANDARD y solo con una autorización firmada y vigente (sección 3). Está probado con el HubSpot simulado; con uno real no se ha leído nunca, y antes hay que validar el lector en el portal de pruebas (el punto de arriba).
- [ ] Las cabeceras reales de Holded están comprobadas con un libro de facturas emitidas.
- [ ] Los abogados han revisado el anexo de la sección 2.
- [ ] Hay seguro de responsabilidad profesional antes del primer cobro.
- [ ] Están firmados el acuerdo de tratamiento de datos y el compromiso de borrado.
- [ ] Hay revisión visual de `verifica.html` en escritorio y en móvil.

Mientras falte algo de esta lista, a quien pregunte se le dice lo que hay: un producto probado contra una empresa ficticia, todavía sin cliente.

## 2. Anexo de alcance · borrador para los abogados

> **Borrador técnico, no asesoramiento jurídico.** Describe lo que el programa hace hoy para que un abogado escriba el texto. Cada frase se apoya en una prueba del repositorio. Si el programa cambia, hay que volver a pasar las cinco pruebas y revisar este texto.

**2.1 Qué se afirma.** El informe solo afirma lo observado en las capturas del CRM y en las facturas que se le entregan, en las fechas que figuran en el informe. Cada cifra lleva una de estas tres bases:

- **Observado:** sale de las capturas o de las facturas.
- **Declarado:** lo dice el vendedor y no se ha podido contrastar.
- **Sin comprobar:** falta el dato necesario. El informe dice cuál falta y por qué.

**2.2 Qué no se afirma.** El informe no dice que la cartera sea íntegra, correcta ni completa, ni que no haya otros problemas que los señalados. No juzga la intención de nadie: una alarma dice que un patrón supera un umbral, no que haya fraude. Lo que no está en el CRM ni en las facturas entregadas queda fuera del alcance.

**2.3 Reglas y umbrales (versión 1).** Están en `shared/verifica/rules.ts` (`THRESHOLDS`). Cambiarlos exige volver a pasar la prueba de referencia.

| Regla | Salta la alarma si… |
| --- | --- |
| Cartera creada o inflada en la ventana de venta | Lo creado o subido en las últimas 6 semanas supera 1,5 veces la media de 3 a 7 periodos anteriores |
| Fechas de cierre aplazadas | Hay al menos 3 oportunidades aplazadas 3 veces o más, o suman el 10 % de la cartera abierta |
| Ganadas sin factura | Una ganada hace más de 30 días no tiene factura. La factura sin referencia cuenta solo como posible si coinciden cliente, importe (±1 %) y fecha |
| Concentración por comercial | Con 3 o más comerciales, los dos primeros suman más de la mitad de la cartera |
| Borrado en bloque | Desaparecen al menos 10 contactos y al menos el 5 % de los que había |
| Renovación declarada | La declarada supera en 5 puntos la observada. Solo se observa con 24 meses de facturas |

**2.4 Huella.** Cada informe, parte de vigilancia e informe de equivalencia lleva una huella SHA-256 de su propio contenido. Cualquiera puede recalcularla con `verifica.html`, sin conexión y sin acceso a los datos. Si se cambia una sola cifra, la huella deja de coincidir. La huella prueba que el documento no se ha tocado. No prueba quién lo emitió: para eso haría falta una firma (decisión pendiente).

**2.5 Sala limpia.** El análisis se hace en el lado del vendedor. Al comprador solo le llegan cifras, seudónimos y huellas. Antes de soltar un documento, una barrera comprueba que no lleve nombres, correos, NIF ni identificadores del CRM; si encuentra alguno, no lo suelta. Es una heurística: busca los textos que conoce. El contrato debe decirlo; si no, hay que revisar a mano cada informe antes de entregarlo.

**2.6 Copia custodiada.** La captura completa, con la sal de los seudónimos, se cifra (AES-256-GCM) junto al informe al que pertenece. La llave va aparte, nunca con el informe ni con la copia. Quien tenga la copia y la llave puede rehacer el informe y comprobar que sale con la misma huella. Falta decidir quién guarda la copia y la llave, cuánto tiempo y cómo se destruyen.

**2.7 Vigilancia entre firma y cierre.** Se hace una captura cada 7 días desde la firma, con 3 días de margen. Dan aviso:

- el borrado en bloque, con los umbrales de 2.3;
- la cartera abierta que se pierde, se borra o se rebaja en un 10 % o más de su importe, si afecta al menos a 3 oportunidades;
- la semana sin captura.

La captura que da aviso queda retenida y no sirve de base para las siguientes hasta que alguien la acepte por su huella. Los umbrales deberían salir del contrato o citarse en él.

**2.8 Migración verificada.** El informe de equivalencia compara la captura del cierre con lo que llegó al CRM del comprador, según un mapa de campos que confirma una persona. Lo más que afirma es «sin diferencias en lo que compara el mapa», nunca «migración íntegra». Dice qué campos del cierre no se comparan. Lo ambiguo, como un contacto con dos candidatos, queda sin concluir. La lista con los IDs reales es para quien corrige la migración y no sale con el informe.

## 3. El primer encargo, paso a paso (72 horas hábiles)

Es para cuando la lista de la sección 1 esté completa. Hasta entonces es solo un guion.

| Cuándo | Qué | Herramienta |
| --- | --- | --- |
| Antes de empezar | Firmar el encargo, el anexo y el acuerdo de tratamiento. Acordar quién guarda la copia y la llave | Abogado |
| Hora 0 | El vendedor da acceso de solo lectura en su equipo. Primera captura, con huella y acta | `scripts/verifica-hubspot.ts --client-authorization` (ver «Autorización de lectura», abajo) |
| Hora 0–24 | El vendedor entrega el libro de facturas y sus cifras declaradas | `--invoices` y `--declarations` |
| Hora 24 | Segunda captura, con su acta, para tener lo que cambió entre las dos. Las dos van a la sala limpia como `--previous` y `--latest` | El mismo lector, con otros nombres de archivo |
| Hora 24–48 | Sala limpia: informe, copia y llave por separado. Revisar a mano lo que la barrera no cubre | `scripts/verifica-sala-limpia.ts` |
| Hora 48–72 | El comprador comprueba la huella en `verifica.html`. Reunión de 45 minutos | `verifica.html` |
| Tras la firma | Vigilancia semanal hasta el cierre | `scripts/verifica-vigilancia.ts` |
| Tras el cierre | Informe de equivalencia de la migración | `scripts/verifica-migracion.ts` |
| Al terminar | Borrar las capturas del equipo de trabajo. Solo quedan la copia custodiada y las actas, en manos de quien se acordó | Acuerdo de tratamiento |

### Autorización de lectura

Sin una autorización válida, el lector no hace ni una petición. La autorización es el registro técnico de un documento que el vendedor firma aparte (el texto es de los abogados). Es un JSON así:

```json
{
  "kind": "verifica-read-authorization",
  "version": 1,
  "portalId": "12345678",
  "engagement": "VF-2026-001",
  "authorizedBy": { "name": "Nombre Apellido", "role": "Administradora única", "company": "Vendedora S.L." },
  "signedOn": "2026-12-01",
  "validUntil": "2026-12-31",
  "scope": ["owners", "companies", "contacts", "deals_with_history"],
  "signedDocumentSha256": "<huella SHA-256 del documento firmado>"
}
```

- La huella del documento sale con `Get-FileHash documento-firmado.pdf -Algorithm SHA256` (o `sha256sum`). Si alguien retoca el PDF, el lector se para.
- Las fechas son días de Madrid; `validUntil` incluido. Una autorización caducada, de otro portal, con un campo mal escrito o con menos alcance que las cuatro partes no sirve.
- El lector solo acepta una cuenta `STANDARD`: un portal de pruebas no pasa por el modo cliente, y uno real no pasa por el de pruebas.

```
<credencial por entrada estándar> | npx tsx scripts/verifica-hubspot.ts --portal 12345678 --client-authorization autorizacion.json --authorization-document documento-firmado.pdf --out captura-h0.json --record acta-h0.json
```

El acta (`acta-h0.json`) dice quién autorizó la lectura, cuándo empezó y terminó, cuántas peticiones se hicieron por método y a qué rutas (sin parámetros), cuántos registros llegaron y la huella exacta de la captura. Lleva su propia huella. En modo cliente no se escribe el informe: sale por la sala limpia, con copia custodiada y llave aparte.

## 4. Canal

- **Agencias de HubSpot:** ya están dentro del CRM de sus clientes y ven compraventas antes que nadie. Se les ofrece el informe para el vendedor, que no depende de que haya comprador.
- **Abogados de compraventas:** son los que meten el anexo en el contrato. Se les enseña el informe con la huella y la copia custodiada.
- **Search funds y asesores:** después, con el primer informe hecho, y siempre con permiso del cliente para contarlo.
- **Salesforce:** solo con demanda pagada, es decir, un cliente que encarga y paga un informe sobre Salesforce. Hasta entonces, HubSpot y luego Pipedrive.

## 5. Lo que no se dice nunca

- «Cartera íntegra», «migración íntegra», «sin fraude» o «garantizado».
- Que la huella prueba quién emitió el informe. Solo prueba que no se ha tocado.
- Que el producto está validado con datos reales, mientras siga probado solo con empresas ficticias.
- Nombres de clientes de un encargo, ni siquiera como ejemplo.
