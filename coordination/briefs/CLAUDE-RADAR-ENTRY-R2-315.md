# RadarEntry · R3 requerida por F2/P2 (revisión315)

10/11/2026. F1 delplazo quedó cerrada en b006c446/b133be0b. Conservas siete reservas; App/main/315delrevisor quedan fuera. Debajo se mantiene elbriefhistóricoR2.

F2: call ysendActivation emiten planb:locked al recibir401 antes de comprobar señal abortada. Tras plazo olectura nueva, eltrabajo anterior puede seguir vivo ybloquearglobalmente una vista yaactualizada, aunque elretorno delPromise.race se descarte.

Reproducido:52/54/tipos0 con dos401simulados obsoletos; una prueba aparte con401delservidor real yloginficticionuevo fallaenmismaaserción1vs0. Archivo canónico tests/e2e/independent-radar-entry315.spec.ts ahora contiene seis casos: originales2intactos, dos transportes simulados,401obsoleto real ycontrol401vigente. Banco canónico3pasan/3fallan/tipos0. No losedites.

Control privado: guardias designal inmediatamente despuésdeawaitfetch yantesde401 enambasrutas, cancelando cuerpo sin efectos globales antiguos:21/21/tipos0; fuente restaurada. Elcontrolpositivo se añadió después yno forma partedeese21. Puedesresolverlo deotraforma conservando semántica.

Corrige el descarte de efectosglobales tardíos, no solo de estado local. Un401actual debe seguir emitiendo exactamenteunbloqueo; no suprimas globalmente401 para pasar. Conserva límitecompleto ysinreenvíos. Añade tusregresiones sensibles, repite16propias+seiscanónicas/tipos ypresenta nuevas huellas. Codex contrastará19Radar+15SCENARIOS. Siguearnés, no appinstalada. No autoaceptar/liberar/editarfuentes deotroactor.

---

# RadarEntry · R2 requerida por revisión315

Conservas tus siete reservas. No toques App/main, servicio316, contexto compartido ni archivos propios de Codex. Dictamen completo: coordination/reviews/CLAUDE-RADAR-ENTRY-independent-315.md.

F1/P2: el POST de activación puede quedar pendiente sin límite y mantener deshabilitados tanto Activando… como Actualizar estado, incluso cuando el servidor ya creó la semilla201. Sonda reproducible: tests/e2e/independent-radar-entry315.spec.ts; banco original46/47/tipos0. Retiene solo el acuse después de route.fetch real y avanza180s de reloj virtual.

Corrige la espera de activación con un plazo finito que abarque transporte y cuerpo; no dependas únicamente de que el transporte atienda AbortSignal. Al vencer, explica que no se sabe si se creó, permite comprobar leyendo y no reenvíes automáticamente. Un timeout no prueba que se cancelara ni deshace la semilla. Descarta éxito/error tardío después de timeout, nueva lectura, cambio de pin, bloqueo o desmontaje. Mantén una sola acción explícita y las guardias de ámbito. No cambies las aserciones independientes de Codex.

En copia privada, Promise.race15s+error unknown y limpieza de temporizador da13/13 (11propias+2sondasoriginales) ytipos0; esa variante no se integra ni impone diseño exacto. Puedes resolverlo de otra forma con el mismo comportamiento. Añade tus regresiones de acuse pendiente/después del efecto y transporte que ignore cancelación, confirmando que detectan la versión anterior. Repite11propias+tipos; Codex repetirá19Radar+15SCENARIOS+sondas con tus nuevas huellas. Mantén límites honestos: siguearnés, no App instalada. Presenta submit, sin autoaceptar.
