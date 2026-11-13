# LABEL063 · Nombre accesible del campo de relación

30/10/2026, Europe/Madrid. Codex. Cambio de una línea funcional: RecordDrawer pasa `label={field.label}` a ReferenceSelect. Reserva exacta nueva para src/components.tsx y este informe, tomada antes de editar; el componente hijo/CSS/tests viven en RELATION062.

ReferenceSelect añade mensajes de carga/error/reintento y recuentos dentro del contenedor del campo. El label explícito permite que el select nativo conserve el nombre de la configuración («Cliente», «Empresa», «Oportunidad»), sin incluir textos dinámicos o nombres de botones en su nombre accesible. No se altera la etiqueta de búsqueda ni las reglas de guardar/cancelar, foco o validación del editor.

Validación conjunta en snapshot final tests/.tmp/relation062-verified-da1bab0c-f8be-44a9-b002-1a90a6d39689: typecheck y Vite correctos;7/7 E2E con nombre exacto Cliente, incluidos carga,404/reintento, selección homónima,401 y1440/390/320. Capturas inspeccionadas por Codex. Quince unitarias del hijo y tres regresiones Modal correctas, fuentes TypeScript iguales a las de esa preparación; el recorrido completo anterior de continuidad también pasa sobre el mismo TypeScript/backend antes de los ajustes exclusivamente CSS. Logs y atribución exacta en CODEX-RELATION-062.md.

La prop label es opcional en el hijo para compatibilidad, pero la integración real del editor la proporciona. Los tests verifican las unidades juntas: LABEL063 por sí sola no acredita las guardas del hijo ni la totalidad de accesibilidad de la aplicación. No lector de pantalla u otro motor probado.

Fuente src/components.tsx SHA-256 **c8e75eb1e72438f075ca51f53885e4444383c99a97fc3b18883ae532685bd514**, cotejada contra snapshot final. El hash del informe lo registra submit. Sin backend, fuentesClaude, estilos globales, dependencia nueva, proveedor, build/dist raíz, instalación, commit/push o autoaceptación. Ambas unidades requieren revisión independiente antes de aceptar.
