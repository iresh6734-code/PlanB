# Verifica · Validación de fuentes

La fase B comprueba una lectura del portal personal de pruebas de HubSpot y una exportación del Libro de facturas emitidas de Holded. El control local compara los archivos con expectativas anotadas por separado. Guarda únicamente el resultado agregado en el informe de validación.

## Preparar la prueba

1. Lee el portal personal autorizado con `scripts/verifica-hubspot.ts --authorized-full-read --portal <ID> --out <captura-nueva.json>`. La credencial de solo lectura se entrega por la entrada estándar del proceso. Guarda aparte el resultado de la lectura que identifica el tipo de cuenta de pruebas. El lector exige una cuenta `DEVELOPER_TEST` o `SANDBOX`. La titularidad personal por sí sola no acredita el tipo de cuenta.
2. Anota los recuentos de comerciales, empresas, contactos y oportunidades para el mismo alcance. Identifica una oportunidad ficticia con un cambio conocido de importe y otro de fecha de cierre. Toma los valores de control del portal o del guion de la prueba antes de revisar el JSON de captura.
3. En Holded abre el Libro de facturas emitidas desde Analítica → Informes → Ventas. Exporta el apartado a Excel y guarda una copia CSV UTF-8 con las cabeceras intactas. Usa datos ficticios o sustituye los datos identificativos de forma consistente con la captura. Usa una factura con IVA, sin referencia a oportunidad, que coincida con una oportunidad ganada por cliente, importe neto y fecha. Anota el número de facturas utilizables, excluyendo las anuladas. [Libro de facturas emitidas de Holded](https://help.holded.com/es/articles/7222830-consultar-el-libro-de-facturas-emitidas)

El Libro puede incluir facturas anuladas. Verifica excluye las que llegan marcadas como anuladas en la columna de estado. Si el CSV carece de esa columna, usa un conjunto de prueba que hayas comprobado en Holded. En este formato «Identificación» corresponde al cliente y «NIF» al emisor. La base imponible alimenta el cruce por importe y el IVA se reconoce como una columna separada. [Columnas del Libro de Holded](https://help.holded.com/es/articles/7222830-consultar-el-libro-de-facturas-emitidas)

## Ejecutar la comprobación

Crea `esperado.json` en la carpeta local de ensayo. Estos valores son de ejemplo.

```json
{
  "portal": "123456",
  "hubspot": {
    "counts": { "owners": 1, "companies": 1, "contacts": 1, "deals": 2 },
    "change": { "dealId": "9001", "amount": [100, 200], "closeDate": ["2026-11-01", "2026-12-01"] }
  },
  "holded": {
    "invoices": 1,
    "unreferenced": { "invoiceNumber": "F-42", "dealId": "9002", "netAmount": 1250 }
  }
}
```

```powershell
node --import tsx scripts/verifica-fuentes.ts --capture captura.json --invoices holded.csv --expect esperado.json
```

El código `0` indica que pasan las comprobaciones sobre los archivos. El código `1` corresponde a una discrepancia y el `2` a un problema con los archivos o con el uso del comando. La salida JSON incluye las huellas SHA-256, recuentos, detección de cabeceras y resultado de cada comprobación. Los registros y sus identificadores quedan en la carpeta de ensayo. Conserva allí también la salida del lector que acredita la identidad y el tipo de cuenta. El comprobador funciona sin conexión y su resultado por sí solo acredita la coherencia de los archivos.
