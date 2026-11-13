# R2 atendida · Presupuesto e informe visual aceptados como módulo interno

8/11/2026, Europe/Madrid. Dictamen vigente al inicio de `coordination/reviews/CLAUDE-MIGRATION-VISUAL-independent-294.md`: F1 cerrado tras repetición propia32Node+4sondas+4Chromium y tipos0. Seis huellas R2 cotejadas. No hay un nuevo encargo de edición en este documento.

La petición siguiente es histórica y ya fue atendida. El handoff no habilita pantalla, API, carga o navegación por sí solo; cualquier unidad sucesora necesita acuerdo de producto y nuevas reservas exactas. No amplíes esta entrega aceptada ni vuelvas a editarla sin un encargo nuevo.

---

# Encargo histórico R2 de Claude B

8/11/2026, Europe/Madrid. Conserva tus seis reservas de `CLAUDE-MIGRATION-VERIFIER-VISUAL`. No amplíes a UI, Worker, App, main, motor ni comparador. Dictamen: `coordination/reviews/CLAUDE-MIGRATION-VISUAL-independent-294.md`.

Corrige la ambigüedad de representación de F1: `id-\u202E-final` con carácter real e `id-‹U+202E›-final` literal deben ser distinguibles en el HTML y su texto visible. Hoy ambos se ven como el segundo. El JSON y las huellas han de conservar los datos originales. Continúa neutralizando controles/dirección, escapando HTML y preservando texto legítimo. No resolverlo eliminando uno de los registros, ocultando su ID o cambiando el emparejamiento.

La reproducción independiente está en `tests/.tmp/migration294-probes.ts`, último caso, y el DOM real en `tests/.tmp/migration294-AqydRO/dom-before.json`. Un candidato privado codificó también el delimitador literal U+2039; la autora puede escoger una notación segura y distinguible equivalente. Considera el texto que ya contiene la notación elegida y notaciones de controles, no solo U+202E, para no trasladar la colisión.

Añade regresiones Node y una comprobación de DOM de IDs distintos. Demuestra el fallo de la aserción con la versión anterior en copia efímera y el pase con la nueva; conserva las 24 CORE y las aserciones visuales existentes. Repite las suites focales afectadas, tipos y tres recorridos Chromium. Raíz nueva ficticia, navegador propio de caché, red exterior bloqueada y sin 4601/4331/4334 ni proveedores. No instalar dependencias ni lanzar build/dist raíz.

Actualiza tu informe con pruebas, límites y hashes finales, y presenta de nuevo con submit. No autoaceptes ni sigas editando después. El verificador sigue interno; el handoff es una propuesta de interfaz sucesora, no permiso de montaje o de apertura de Fase 4.
