# HubSpot · comprobación REAL de lectura · runbook y traspaso (unidad CLAUDE-HS-READ-CLI-173, R2 tras el dictamen 178)

4/11/2026. **Estado: preparado y probado solo con respuestas sintéticas. No se ha hecho ninguna llamada real a HubSpot y este encargo no la autoriza.** (Los nombres de archivo llevan 172 porque se reservaron con la primera inscripción de la unidad, bloqueada y sustituida por 173; son las mismas rutas.)

## Para poder ejecutarla faltan exactamente dos cosas (del usuario)

1. El **ID numérico del portal de ensayo** (`DEVELOPER_TEST` o `SANDBOX`) de este equipo.
2. Su **autorización expresa de las cinco lecturas**: 1 GET de identidad + 1 GET de un elemento por cada objeto (clientes, empresas, oportunidades, tareas) sobre ese portal. El script lo exige como `--authorized-reads 5`; sin ese argumento no hace ninguna petición.

La credencial la introduce el usuario en su terminal, **sin eco y por entrada estándar**; nunca como argumento de la orden, ni en un chat, informe o fichero (ni siquiera temporal o de entorno).

## Qué garantiza el script y dónde se garantiza

| Garantía | Dónde | Probado con |
| --- | --- | --- |
| Portal esperado explícito; solo modo ensayo | `scripts/hubspot-read-check.ts` (`mode: 'test'` fijo) y `checkHubspotRead` (exige `DEVELOPER_TEST/SANDBOX`) | portal distinto, STANDARD y APP_DEVELOPER ⇒ **1 petición** y parada antes de leer objetos |
| Credencial solo por entrada estándar | `readSecret`; terminal interactiva rechazada; ningún argumento se repite en errores | `--token`, `--password=`, posicional |
| Sin guardar ni imprimir credencial, cabeceras o cuerpos | salida construida con lista blanca; el transporte descarta cuerpos de error y el módulo descarta los de éxito | cuerpos y errores con la credencial dentro; JSON con campos exactos |
| ≤ 5 GET; cada ruta una vez; sin reintentos | `server/hubspot-read-check-transport.ts` (en el borde de red, independiente de la lógica del módulo) | 16 peticiones bloqueadas por motivo; 401/403/429/500 ⇒ 1 petición |
| Sin escrituras, paginación, consulta extra, cabeceras extra, redirecciones | ídem + `readonlyFetch` del módulo | POST/PUT/DELETE, `after=`, `limit=100`, `Cookie`, `redirect: follow`, 302 |
| Tiempos y límites de lectura | 1–15 s por petición (8 s por defecto), plazo global; **tope de 64 KiB por respuesta**: al superarlo (por bloques o por `content-length`) se cancela la lectura y se **rechaza la respuesta entera** (el módulo la ve como cuerpo ilegible; no se entrega ningún prefijo). Un cuerpo de exactamente 64 KiB sí se acepta | servidor mudo; 128 KiB; JSON completo + espacios + sufijo inválido en identidad y en cada objeto; límite exacto, +1 byte, corte de bloque en el límite, `content-length` declarado |
| Resultado por objeto: confirmado / permisos insuficientes / error / desconocido | `objectLine`, `headline` | casos parciales, 401 a mitad, cortada, fallo de red |

**Hallazgo al auditar `checkHubspotRead`:** cumple los puntos de sin-reintento, solo-GET, sin-redirección, parada tras identidad y sin-secretos, pero **no tiene tope de bytes por respuesta** (`response.json()` lee todo el cuerpo). No he editado el módulo (160 sigue en revisión y no se edita tras presentarla): el tope lo impone el transporte protegido del script. **Corrección R2 (dictamen 178):** la primera versión cortaba en el tope y entregaba el prefijo, que podía ser un JSON completo seguido de espacios y por tanto «válido»; ahora la respuesta que supera el tope se rechaza entera. Si la identidad la supera, la secuencia se detiene tras 1 GET; si un objeto la supera, ese objeto queda como «respuesta no válida» y nunca como legible. Además el resultado «confirmado» exige `respuestasTruncadas = 0` (salvaguarda redundante). Si Codex prefiere ese tope dentro del módulo, será una enmienda reservada de 160.

## Ejecución (la hace el usuario, en su terminal, cuando 160 y 173 estén aceptadas)

No usar `scripts/block-external.cjs`: bloquearía la red por diseño. PowerShell, pide la credencial sin eco y la pasa por tubería:

```powershell
$secure = Read-Host 'Credencial del portal de ensayo' -AsSecureString   # sin eco
$bstr = [IntPtr]::Zero
try {
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) | npx tsx scripts/hubspot-read-check.ts --portal <ID_DEL_PORTAL_DE_ENSAYO> --authorized-reads 5
}
finally {
  if ($bstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  $secure.Dispose(); Remove-Variable secure, bstr -ErrorAction SilentlyContinue
}
```

La credencial viaja por la tubería hasta la entrada estándar del proceso; no es un argumento (no queda en la lista de procesos ni en el historial de la orden) y el script rechaza una terminal interactiva. `ZeroFreeBSTR` borra y libera la copia no gestionada del BSTR. **No se promete borrar toda copia:** el `string` gestionado que crea `PtrToStringBSTR` es inmutable y lo recoge el recolector de basura cuando quiere, y el proceso de Node la mantiene en memoria mientras dura la orden. Cerrar la terminal al terminar y, si la credencial se ha pegado alguna vez en un chat o fichero, revocarla y emitir otra.

Código de salida: `0` acceso de lectura confirmado en los cuatro objetos; `1` cualquier otro resultado; `2` uso incorrecto (no se hizo ninguna petición). `--json` imprime el mismo resultado con campos fijos; `--timeout-ms` (1000–15000).

Pruebas (sintéticas, sin red externa): `npx tsx --test tests/hubspot-read-check-cli.test.ts tests/hubspot-read-check.test.ts`.

## Cómo consumirá la App el resultado (no montado)

1. La ruta de servidor (unidad futura) llamará a `checkHubspotRead` **con el mismo transporte protegido** y guardará solo el `ReadCheckResult` (`state`, `environment`, `accountType`, `objects[].outcome`, `checkedAt`, `freshUntil`), nunca token ni cuerpos.
2. La pantalla usará `viewOfReadCheck({configured, checking, last, now})` y mostrará: **qué se comprobó** (identidad + lectura de un elemento por objeto, por objeto), **cuándo** (`checkedAt`, hora de Madrid) y **hasta cuándo se considera reciente** (15 min; después vuelve a «configuración guardada · acceso sin comprobar»), con «cuenta de ensayo»/«cuenta real» según `environment`.
3. Textos obligatorios junto al resultado: «Comprobación puntual de lectura» y «No demuestra sincronización continua ni permisos de escritura». «Conectado/verificado» solo con `read_verified` fresco; la simulación local nunca usa esas palabras.
4. Pendiente de unidades con reserva: ruta en `server/v2.ts`, contrato en `shared/operations.ts` y su parser estricto en `shared/local-integrations.ts`, pantalla en `src/LocalIntegrations.tsx`. **No se ha tocado `App.tsx` ni ningún archivo ajeno.**

## Límites

- Una comprobación puntual no prueba sincronización, escritura, lectura de otros objetos/campos ni que la credencial siga válida después de `freshUntil`.
- Las 5 lecturas pueden dejar rastro de uso en la cuenta; el elemento leído se descarta pero atraviesa la red.
- La forma de las respuestas reales solo se ha contrastado con la documentación, no con HubSpot.

## R2 · cambios respecto a la entrega anterior (dictamen 178, F1)

- `server/hubspot-read-check-transport.ts`: al superar el tope ya no se entrega el prefijo; se cancela la lectura del origen y se devuelve un cuerpo que falla al leerse. Rechazo anticipado si `content-length` supera el tope.
- `scripts/hubspot-read-check.ts`: «confirmado» exige además `respuestasTruncadas = 0`.
- Runbook: BSTR liberado en `finally`, sin eco, sin prometer borrado de copias gestionadas.
- Pruebas nuevas en `tests/hubspot-read-check-cli.test.ts` (4) y las tres del revisor en `tests/independent-hubspot-read.test.ts` (no editadas). Detalle de resultados y mutantes en el informe.
- **Sigue sin haber llamada real**: faltan el ID numérico del portal de ensayo propio y la autorización expresa de las cinco lecturas. Tras la aceptación de R2 se presentará la orden concreta para revisión antes de ejecutar nada.
