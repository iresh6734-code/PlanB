# Dictamen vigente: 254 R2 favorable

7/11/2026, 10:55:26, Europe/Madrid. Se aceptan las seis huellas presentadas; la devolución R1 inferior queda como evidencia histórica.

## Repetición independiente

Corte tests/.tmp/pack254-r2-review-uzqPko, 289 entradas de fuente cotejadas, base aceptada263 y API216R4 aceptada. Doce pruebas Node pasan: nueve de autora y las tres sondas independientes originales (cambio de contenido con tamaño constante, uniones y obligatoria ausente). Tipos focales limpios. Las tres sondas ya fallaban con R1 (6/9) y pasaban con propuesta privada (9/9); ahora pasan con los bytes entregados R2. El código distingue obligatorias de opcionales, vincula ruta/tamaño/SHA de contenido con manifiesto v2 y rechaza raíz y entradas enlazadas.

Chromium3/3 sin reintentos, arnés R2 intacto: instalación nueva fuera de la copia de fuentes, servidor empaquetado y Kit real con73paquetes; 401 sin sesión y protección de origen; paquete ausente, alterado o enlazado deja404 y la App sigue; consentimiento cancelado sin ensayo, cancelación con cierre de procesos, segunda pestaña, ensayo completo con un create y sin duplicados, descargas, reinicio con registro persistido, distinción entre ficción y copia activa. Se conserva el control de cero cambiosCRM y tráficoexterno. Anchos1440/390/320 con captura320 abierta e inspeccionada. Consulta posterior de procesos limitada a la raíz exclusiva devuelve lista vacía.

No se adaptó App ni la pruebaE2E durante esta repetición. Solo el arnés entregado proyecta en su compilación la llamada de montaje; el main compartido sigue pendiente de su unidad exclusiva. No acredita ejecución en otro ordenador, proveedor real, copia activa recuperable ni actualización de una instalación anterior. AlcanceWindows.

## Huellas R2

- scripts/build-relay-kit.mjs: b4b2d8851ce116ff95749338c2888a9f53889f427492c8e0c7872ba28fe30931
- server/relay-rehearsal-mount.ts: 74bbc1053b6b02138587f74ba7149c911404232ea4fbece5600060e43349c481
- tests/relay-rehearsal-mount.test.ts: 1d8811d3acd2884af380b2360ba9a9ef3b7a989b023c03034f1cf85437d13994
- tests/e2e/relay-packaged.spec.ts: d8104e45b541fdad7327f4aeaaca7fb20c35ebe3e8bdfb124d6b4db17095ceb4
- coordination/plans/MONTAJE-RELEVO-254.md: 0aa4c0de4f8e3a0e321db1d5fa17e1d1a2057bb586faa569cfc0866edf359e79
- coordination/reports/CLAUDE-RELAY-PACK-254.md: 7178f305af65551883c2dd66c5fdf3bfe97ced95546697194bcf53fd29501071

---

# 268 · Revisión independiente del paquete de relevo 254

6 de noviembre de 2026, Europe/Madrid. **Devolver para R2 con las seis reservas.** El paquete normal completó el ensayo en una instalación nueva. Tres garantías de integridad fallan al introducir cambios controlados.

## Corte probado

Se cotejaron las seis huellas presentadas y una proyección de 289 entradas, basada en 263 con 224 aceptada, dos scripts de 106 y 116 y los bytes de la API 216 R3 ya revisados. La API R4 sigue pendiente. El paquete construido contiene 105 archivos de código, 73 paquetes, 3.515 archivos de dependencias y 34.069.149 bytes de dependencias. La instalación de prueba queda fuera de la proyección de fuentes. Su servidor es `main` compilado en un solo archivo, con el montaje 254 proyectado y sin una carpeta `node_modules` propia. El Kit aporta sus dependencias.

El arnés original aplica parches de App y evidencia anteriores a 263. Solo en la proyección privada se omitieron esos dos parches ya presentes y se conservó el montaje de relevo. Las aserciones del navegador quedaron intactas. Un primer intento de preparar la proyección omitió los dos scripts auxiliares del Kit. El segundo los tomó de sus huellas aceptadas antes de repetir el banco. Los resultados que siguen corresponden a ese corte completo.

- **Node 6/6** del autor y tipos focales limpios.
- **Chromium 2/2.** Se comprobó 401 sin sesión, consentimiento cancelado sin POST, un solo árbol en curso, cancelación con procesos vivos y posterior cierre, ensayo completo con un create y cero duplicados, descargas y resultado persistido tras reiniciar. El pasaporte señala que la práctica ficticia no acredita la copia activa. Pasaron los anchos 1440, 390 y 320 px, con inspección de la captura de 320. El recorrido terminó con cero peticiones externas y cero cambios CRM. El PID del último servidor ya no estaba presente al cotejar el recibo.

## Tres hallazgos reproducidos

1. **Dependencia alterada con el mismo tamaño.** El resumen de `node_modules` solo vincula nombres y tamaños. Cambiar un byte del JSON del cargador `tsx` lo deja inválido con el mismo tamaño. El verificador devuelve `ok: true`, el montaje registra la ruta y GET responde 200. El control debe rechazar ese paquete antes de montar.
2. **Uniones de primer nivel.** El verificador empieza a recorrer dentro de cada directorio, sin comprobar primero el directorio mismo. Una vista con uniones hacia `server`, `shared`, `scripts` y `node_modules` de otro directorio sintético se acepta cuando los bytes coinciden. Windows permitió reproducirlo con junctions. El alcance de esta prueba es el rechazo prometido de enlaces, con ambas carpetas propias.
3. **Dependencia obligatoria ausente.** La búsqueda omite una dependencia transitiva que no encuentre, aunque esté en `dependencies`. Una clausura sintética se devuelve como completa con una obligatoria ausente. La ausencia de una opcional debe seguir siendo válida.

El banco exacto da **6/9**, con los tres fallos anteriores. La propuesta privada usa huella de contenido en el resumen, rechaza uniones de primer nivel y distingue obligatorias de opcionales. El mismo banco da **9/9**. Se restauraron y cotejaron los seis archivos. La propuesta acredita los tres contrastes en Node. Chromium se ejecutó sobre las fuentes 254 presentadas y las adaptaciones de composición descritas.

Recibos, manifiesto, capturas y logs en `tests/.tmp/pack254-review-OI0LeM`. La contraprueba está en `causal-wyZNMA`. El alcance es Windows y datos ficticios. El montaje compartido y la integración final del paquete con 216 R4 quedan pendientes.
