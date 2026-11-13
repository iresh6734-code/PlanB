# Recuperación verificable · Plan propio de Codex

30/10/2026, Europe/Madrid. Objetivo: detectar que una copia portátil deja fuera cambios de una exportación de referencia y hacer que una futura pantalla de recuperación se apoye en evidencias concretas. Opus conserva OPS048 (radar/comparador en Continuidad); este plan no reabre sus archivos ni amplía su encargo.

## Unidad ejecutada: SAFE049

Nuevo módulo server/backup-coverage.ts y CLI scripts/check-backup-coverage.ts, con archivos explícitos y contraseñas independientes solo por stdinJSON opcional. Valida ambas copias mediante BACKUP041/restauración en memoria; compara la revisión exacta de recuperación existente. Salida: hashes, recuentos, tipo de divergencia y siguiente paso, sin valores/IDs/campos de fichas.

- Coincide con la referencia: igualdad de bundleRevision, que excluye exportedAt y conserva orden de arrays. No prueba estado vivo, copia separada o RTO.
- No cubre cambios locales: mismo contexto íntegro y captura, historial de la copia es prefijo estricto de la referencia. Solo entonces se cuentan operaciones que faltan. Cambios revertidos siguen contando aunque valores actuales coincidan.
- Revisión diferente: historia divergente, dirección inversa o cambios en sesión, configuración o estado de devolución. No inventar un orden por timestamps ni sumar registros como operaciones.
- Incompatible: otro portal, clase, origen, entorno o captura. Un comparador histórico de capturas y la cobertura de una copia responden preguntas distintas.
- Inválida: falla formato, descifrado o contrato real de restauración. No compara parcialmente ni expone errores de parser/contraseña.

KPI verificable de esta unidad: casos de copia que omite cambios detectados sin falsos «coincide» en límites de identidad, metadatos de devolución y corrupción. Pruebas causales y reporte completo, sin puntuaciones opacas o estimaciones monetarias. Disponible en fuente/CLI, sin pantalla o endpoint instalado.

## Siguientes puertas (plan, no implementación acreditada)

1. **Revisión separada de BACKUP041/SAFE049.** Casos adversos, límites de32MiB por archivo, no filtración, identidad y semántica de historia; mantener reservas hasta aceptación. No autoaceptar la nueva herramienta por usarla en una demo.
2. **Cerrar OPS048 con Opus.** Revisar presentación final y carrera de captura retirada documentada en coordination/reviews/CLAUDE-OPS-048-progress.md; hashes/E2E de versión concreta. Evitar tareas simultáneas sobre ContinuityHome y una segunda ventana de navegador.
3. **Consumidor visual de recuperación, encargo posterior exacto.** Elegir archivos explícitos, mostrar qué se comprobó y cuándo, separar referencia aportada de estado vivo; no guardar contraseñas o convertir «coincide» en «negocio recuperable». Reservar componentes/rutas solo después de diseño del contrato y del control de acceso. No añadirlo a mitad de OPS048.
4. **Ensayo de recuperación en una carpeta nueva.** Medir inicio/fin de un flujo utilizable con captura/revisión identificadas, paquete concreto y datos ficticios. Mantener artefactos, exportación y evidencias separados. El preflight en memoria no sustituye ese ensayo ni prueba otro equipo.
5. **Candidata integrada y actualización comprobada.** Después de aceptar fuentes, build aislado, respaldo vigente de artefactos, pruebas de los flujos afectados y comprobación del artefacto servido. REL033 y otras revisiones pendientes no se limpian por antigüedad. No usar un respaldo viejo para pisar publicación posterior de otro chat.

## Reparto y límites

Opus: seis archivos de OPS048 y su informe. Codex: siete archivos exactos SAFE049 (módulo/CLI/dos tests/plan/informe/revisión de progreso), más memoria/panel bajo reserva propia LAB035 solo documental. No se modifican App, TeamApp, estilos globales, contratos, servidor HTTP o archivos de otros encargos. No backend nuevo en el piloto.

Sin proveedores, bases reales, claves/DPAPI ajenos, lectura corporativa, correo, acciones externas, dependencias nuevas, build/dist raíz, despliegue, commit o push. La coexistencia se comprueba con el tablón; el protocolo no bloquea físicamente editores. La continuidad de este seguimiento depende de una ejecución activa del chat, no de prometer modelos permanentes.
