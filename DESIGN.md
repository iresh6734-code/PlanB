# Plan B · Sistema de interfaz

Identidad vigente: software comercial y continuidad, español, azul reconocible, uso profesional frecuente. La interfaz organiza decisiones y evidencia; no necesita decoración de dashboard. Se conserva el contenido y la autorización real de cada contexto.

Agente, 28/10/2026: configuración del modelo local plegada y proporcionada al contenido; habilitación distinta de disponibilidad comprobada. Vista previa con contexto acotado a la izquierda y borrador a la derecha, máximo74ch, apilados por debajo de900px. Autorización junto al texto que recibirá el modelo. La procedencia de cada análisis y los fallos conservados son visibles. No usar indicadores de conectado ni de IA real para reglas o respuestas ficticias.

## Superficies y color

- Canvas: `#f2f4f7`; contenido: `#fffefd`; capa de apoyo: `#eaf0f6`; navegación: `#edf1f6`.
- Tinta principal: `#19314f`; texto secundario: `#52627a`; borde: `#d9e1eb`.
- Acción: `#2858dc`; acción suave: `#e6edff`; selección siempre explícita.
- Éxito: `#216448` / `#edf6f0`; aviso: `#835c1c` / `#fff7e8`; error: `#a2343f` / `#fff1f1`.
- Borde de un píxel, radios de 4–8 px según función. Sombras suaves con desplazamiento solo en paneles elevados/overlays.

## Tipo y ritmo

Segoe UI Variable/Segoe UI/sistema, una familia coherente. H1 24/30 semibold, H2 16/22 semibold, cuerpo 13–14/20, metadatos 12/18. Datos tabulares y estados legibles. No escalar titulares por ancho de ventana. Espacios 4/8/12/16/24/32.

## Composición

Contenido principal antes que contexto. Hoy usa lista de prioridades y compromisos condicionados por datos. Continuidad distingue disponibilidad, verificación y actualización. Tablas y filas predominan para datos; paneles solo para finalidades distintas. No igualar altura de paneles con cantidades distintas. No reservar columna para un vacío. La configuración y las decisiones de revisión tienen ancho de lectura acotado, no campos interminables.

## Componentes

Cabeceras con acciones próximas; barras de estado en una línea adaptable; filas de 44–54 px para datos; listas operativas con título/contexto/acción; vacíos de tamaño de contenido; formularios agrupados por conexión, alcance y control. Etiquetas y botones conservan los nombres operativos actuales.

Foco visible, estados hover/disabled/error/loading, avisos semánticos, ayudas asociadas, objetivos de interacción de al menos 32 px y 42–44 px en móvil. El texto secundario mantiene 4,5:1; no usar opacidad para etiquetas que necesitan leerse. Movimiento breve de estado y `prefers-reduced-motion`. No elevar color, iconos ni sombra sin una función.

## Contextos y verdad de producto

App local y equipo comparten vocabulario visual pero mantienen bases y permisos separados. El contexto debe estar identificado; no suplantar autenticación ni mezclar datos mediante el diseño. Logos oficiales se sirven localmente. Demo, simulación, aceptación del proveedor, verificación y resultado incierto se distinguen siempre.

Referencia estructural, auditoría y decisiones: `UX-ARQUITECTURA-0.6.md`. Esta etapa forma parte del cierre 0.6 y no declara aceptada la nube.

## Correo comercial

Preferencia del usuario, 27/10/2026: sobrio y personal. Texto con contexto comprobable, sin falsa familiaridad ni acuerdos inventados; firma opcional y reunión claramente separada. La vista previa conserva un ancho legible, párrafos y fecha/hora de Madrid. Sin cabeceras promocionales, imágenes remotas ni ornamentación de newsletter. Alternativas HTML/texto generadas desde el mismo contenido revisado. Aislar las tablas de presentación del correo de los estilos de tablas de datos del CRM; no heredar `nowrap`, alineación de la última columna ni alturas de filas. Un cambio de firma o formato invalida la aprobación igual que un cambio de destinatario.
