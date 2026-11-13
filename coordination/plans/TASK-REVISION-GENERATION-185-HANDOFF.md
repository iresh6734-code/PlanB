# Generación activa en la revisión de tareas185

4/11/2026, Europe/Madrid. Nueva garantía de fuente presentada para revisión; no instalada en181. Complementa los handoffs128/166/183; los documentos aceptados de esos cortes se conservan como historia.

## Contrato resultante

El fingerprint de `readTaskRevision` añade `store.generation?.generatedAt` junto a los datos que ya incluía:instalación,snapshotcompleto,spec,sesión,registro y último cambio. No añade campos alJSONpúblico ni cambia rutas/formato. El token sigue siendo opaco;un consumidor no debe reconstruirlo.

Activar por el flujo normal una generación de fecha nueva, aunque su especificación sea idéntica, invalida los tokens abiertos antes. ElPATCHcon tokenanterior devuelve409/TASK_REVISION_CHANGED, incluso si los valores serían un no-op. No se cambian registros/historial con ese rechazo. Obtener una revisión nueva mediante una lectura explícita permite un siguiente intento;un no-op con token nuevo conserva versión e historial.

Preparar una candidata sin activarla no cambia la generación activa ni invalida su revisión. Activar con la misma fecha y los mismos datos ligados mantiene la identidad;no inventamos un contador por el mero archivado. Si todos los datos del fingerprint vuelven exactamente a un estado anterior sin cambios de historial,el token puede volver a coincidir:esto no es un identificador monotónico de generaciones ni una solución universal deA→B→Aenmetadatos.

Los cambios nuevos de contexto aún deben comprobarse antes/después al leer (183). La comparación y escritura delservidor son síncronas bajo un único escritor cooperativo y cubren los datos ligados al fingerprint. No protegen rutaslegacy,escritores externos,no cooperantes,múltiplesprocesosoidempotencia por intención. No amplía autenticación,integraciones o permisos.

Tokens producidos por el servidor anterior pueden rechazarse tras cambiar de binario. Conservar el borrador y pedir revisión explícita,no renovar tokens y reenviar silenciosamente. No modificar una instancia en ejecución para instalar este código:preparar otra unidad con carpeta/semilla/build/manifiesto nuevos y comprobarla.181sigue conbackend4d63e027… anterior185,UI158legacy;aceptar esta fuente no cambia esa demo ni convierte su formulario enCAS.

## Adopción con170/U2

Esperar aceptación de170yU2,después reservar una única integración delcontrato136/estrategia/ficha y sus consumidores.183es la composición de acceso a datos que preserva contexto y revisión;no crear otro gestor paralelo. El resultado debe conservarchanged/unchanged/current,despacho,cancelaciónpreflight frente a envío incierto yprocedencia humana/servidor. No-op no debe inventar una escritura o incremento. Verificar soloGET;coincidir valores no confirma autoría ni recupera unacuse.

**Aclaración de401 del corte184:**183no añade su propio dispatcher,pero readContext123,que usa internamente, sí emite `planb:locked` al recibir401 en navegador. El puente tiene ese efecto heredado en sus lecturas;no se puede tratar como libre de efectos de sesión.166por sí mismo informa401sin emitir eseevento. Eladaptador/hostde170/U2debe contemplar ambos caminos y conservar el ordenauth158. No asumir un único evento si varias peticiones paralelas reciben401. La sonda184observó un evento en su casohealth200/estado401, no una garantía universal deconteo.

No se modifica elhandoff183aceptado ni sus resultados históricos;ese documento decía «por su cuenta»,no acreditaba ausencia de efectos heredados. Este traspaso hace explícita la advertencia para la integración nueva.
