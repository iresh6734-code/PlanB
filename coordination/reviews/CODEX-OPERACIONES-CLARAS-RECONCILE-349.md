# Operaciones claras y Faro necesitan una nueva presentación

Banco operations349-Uote8m. Se congelaron 806 archivos. Typecheck completo limpio y 87/87 pruebas de avisos, cronología, tokens, montaje de Continuidad y contratos de recorrido. Son pruebas Node y estáticas. No se abrió una vista de navegador en este corte.

El informe de Fable documenta su intervención sobre Inicio y el origen de los avisos. El checkout actual conecta Inicio y Continuidad con el menú mediante receiveContinuity. Inicio presenta las acciones de aviso mediante onOpenAlert y Faro aporta sus estilos. El antiguo informe de Opus ya no describe la versión actual de los siguientes archivos.

- src/operaciones-claras.css · presentada 1072948ef94f8dfa01182b9975a46cbed385b8589a8c35bb2fc928bc721cc80b · actual 7fef74f553ceeb38a3b429dcb87152d3d188a71eb76f98f4d55053dd893beadb
- src/HomeOverview.tsx · presentada 9825e987bff6de7c009c2eadebfb9596439d31218bc43f16853cb9b2e3b327be · actual 8b25c9013b792d9c9c2e84299b92b582d229eceed18deb98b5c78398b1b21099

## Hallazgo reproducido con el servicio real

En un Store de memoria con una copia ficticia, la programación habilitada sin conexión configurada produce connected:true y connection:null. Continuity.tick registra la hora del intento y «No se pudo iniciar la captura programada». No se crea ningún trabajo. captureAutomation devuelve active:true y continuityAlerts omite aviso de capturas detenidas o fallo. El caso queda en automation-probe.json. La sonda usa capturas nuevas de ficción y no emplea credenciales.

La cronología debe distinguir programación habilitada de estado operativo. Con conexión ausente debe explicar el requisito. Cuando un intento falla de forma transitoria puede seguir habilitado y mostrar el fallo por separado. Probar el estado sano, el fallo sin conexión y recuperación posterior. Coordinar con Fable la lógica y su prueba en un alcance propio antes de editar rutas nuevas. Este informe no modifica sus fuentes.

Se pidió a Opus una presentación actualizada con las huellas de Inicio y CSS, el alcance exacto de la colaboración con Faro y evidencias de los flujos que cruzan el menú. Se conservó la presentación anterior. QA052 sigue aceptada como auditoría.
