# CODEX-LIFECYCLE-EXIT-133 · Cierre verificable del proceso de ensayo

2/11/2026, Europe/Madrid. Presentada para revisión. Solo cambia tests/helpers/app-lifecycle-harness.ts;126done se conserva como resultado histórico del corte anterior. No se edita lockInstance, Store, App o una fuenteClaude.

## Motivo

La repetición del otro chat tuvo dos resultados que deben conservarse separados del2/2 original de126:

- `tests/.tmp/review126-220b317a-a3a2-4b05-be40-49fee8d3b816`:0/2 antes de DOM, al no confirmar health de los procesos. El autor de la repetición diagnosticó EACCES de loopback en el sandbox; no fue un fallo del recorrido funcional.
- `tests/.tmp/review126-elevated-ce653a4e-e7af-45e0-86a1-a705ff93554c`:1/2. Distribution pasó; Agencia llegó al reinicio y el nuevoPID5876 rechazó el bloqueo, que aún apuntaba a33508. Aunque ya se había registrado exit/SIGTERM, una consulta posterior vio33508 existente y otra devolvióESRCH. Son observaciones comunicadas por el otro revisor; no prueban por sí solas si era el mismo proceso, un handle retenido o reutilización dePID.

El arnés antiguo esperaba solo el evento exit. Eso no acreditaba que los streams/handles se hubieran cerrado ni que elPID hubiese dejado de existir para la guarda de la app. Reabrir sin esa comprobación podía encontrarse con un rechazo legítimo y conservador de lockInstance.

## Cambio

stop espera ahora el evento **close**, con timeout acotado y timer limpiado. Después comprueba la desaparición delPID mediante process.kill(pid,0); si sigue existiendo, espera en intervalos20ms hasta10segundos. Solo ESRCH permite continuar. Otros errores o unPID aún vivo/reutilizado producen error y conservan el bloqueo: no se borra .instance, no se mata esePID ni se vuelve a lanzar la aplicación a ciegas. La señal de cierre se envía únicamente al ChildProcess creado y todavía activo por este arnés.

Se registra stopped-PID.json con el evento, la ausencia observada, contador, tiempo y fecha. El evento exit anterior se archiva ahora como event:close para no confundir la evidencia. Se conserva la misma base nueva entre los dos procesos del ensayo; las demás copias,4591 y4451 permanecen intactas.

## Verificación

**2/2 E2E**,0fallos/skip/flaky, mismas aserciones126. Evidencia nueva `tests/.tmp/cycle126-d39faf5d-de83-4e40-9502-f328b435f6d3`, con manifests/inputs, resultados, logs y tres stopped-*.json:PID30056 cerrado antes de reabrir como29160;PID31232 del segundo perfil cerrado al terminar. Cada comprobación final observó ausencia al primer intento(0–1ms); este pase no reprodujo la ventana transitoria observada por el otro chat. No demuestra que todos los cierres de Windows sean inmediatos.

El hash del spec126 permanece `964aeef316bdf24979d6ddc994f62c3fe2a2451607d6fbfe147e20afa021d665`. El backend y14artefactos UI son los mismos congelados de125 en nuevas bases ficticias, con claves kind:test precreadas, entorno allowlist y red externa bloqueada. No se usa una base o clave del preview.

Typecheck final limpio en `tests/.tmp/exit133-8fd7dbef-d5d7-442c-8a85-addd8b75b344/typecheck-final.log`. El primer chequeo detectó que TS no conservaba el estrechamiento de child.pid dentro de la función stop; se añadió una aserción no nula sobre elPID que ya se valida antes de crear esa función. Es el único cambio posterior al2/2. La transpilación JavaScript de ambos archivos es **idéntica byte a byte**, comprobada en type-only-equivalence.json; el archivo ensayado se conserva en harness-e2e-tested.ts. No se presenta como otra repetición de navegador.

## Alcance

Es una mejora del arnés que exige evidencia más fuerte antes de reiniciar; no relaja la protección de la aplicación ni diagnostica una avería de datos. No prueba caída abrupta,PIDreutilizado real, apagado físico o disponibilidad perpetua del servicio. Si otro proceso conserva elPID o la observación no es fiable, el ensayo falla en vez de eliminar el bloqueo.

Los ensayos anteriores, sus fallos y la aceptación histórica126 no se reescriben. El corte vigente del helper se presenta con133 y sus hashes nuevos; no se acepta el hash antiguo para esta versión. La revisión128/129 es independiente: su bloqueo del lanzador pasó, y el servicio condicional128 sigue sin montar en la UI. Claude123 conserva su reserva de correcciones y130 su QA; no se tocaron.

Siguiente: revisión independiente de133 y, si aporta evidencia nueva, repetición del otro chat sobre este corte con acceso loopback apropiado, sin cambiar aserciones o procesos ajenos. No autoaceptación.
