# Revisión independiente CODEX-UX-001

29/10/2026, Europe/Madrid. Revisor Codex review_h2, distinto del autor. Dictamen final favorable: aceptar tras presentación y cotejo de hashes vigentes, como revisor distinto del autor. Solo se escribe este informe; memoria reservada al coordinador. No cuentas, proveedores, nuevas fuentes a Claude o navegación.

## Habilitación y accesibilidad

Para cualquier data renderizada, prepareReasons.length>0 equivale a las condiciones anteriores busy || !canWrite || !data.source.canPrepare || !data.contact.email. Cada condición produce una cadena no vacía o null y el filtro solo elimina null. No se habilita ninguna acción antes deshabilitada, ni se cambian handlers, intención internalOnly o payloads. La restricción por email sigue siendo la existente, sin intentar rediseñarla en esta unidad.

Las causas derivan de props y datos actuales durante render, sin estado o efecto duplicados, siguiendo react-best-practices. useId se invoca incondicionalmente y proporciona asociación estable aria-describedby con el texto visible cuando existen motivos. El helper explica también el motivo transitorio busy; las razones permanentes distinguen permiso, fuente y ausencia de correo. No depende solo de un tooltip o de que el botón deshabilitado reciba foco. Sin QA visual, no se acredita contraste, posición o comportamiento de lector de pantalla real.

## Vigencia al cambiar contexto

El único consumidor encontrado es TeamContacts. Su key incluye tenant, selected y showCrm, de modo que cambiar empresa, contacto o local/activo remonta CustomerDossier y reinicia data, motivos y useId. El efecto de carga cancela la aplicación de una respuesta antigua mediante alive. Las causas canWrite y busy responden directamente a nuevos renders.

Límite previo para una reutilización futura: CustomerDossier no limpia por sí mismo data al cambiar path/query sin remontaje. Durante esa carga podría conservar datos y razones anteriores si un nuevo consumidor lo reutilizara sin esa key. El consumidor actual evita ese caso; no se amplía el cambio para alterar su ciclo de carga. Si se elimina la key o se añade otro consumidor, deberá abordarse explícitamente.

## Comprobaciones y aceptación

No se detecta problema material dentro del alcance de UX001. Los hashes actuales coinciden con la presentación; el informe del autor documenta typecheck y buildVite correctos a carpeta separada ux001-build. Esos comandos no se repitieron por este revisor. No se ejecutan tests que reproduzcan las expresiones sencillas ni se afirma QA visual, móvil o despliegue.


Versiones cotejadas:

- src/CustomerDossier.tsx: f1f9b265affecd51b26a37ffaad3c5f891a452c43a854a74c140a5df1640c1b8
- coordination/reports/CODEX-UX-001.md: b3e9bd62b738cc97ffe180d0233e4dbfdf816cb985f1cdab1456ac954f0b33a5

El informe final preserva la atribución, la equivalencia de las cuatro condiciones, el remount del consumidor y el límite previo de reutilización sin key. No se acepta globalmente el informe UX heredado. CODEX-UX-001 aceptada por este revisor distinto; el propio informe se presenta sin autoaceptar. La actualización de contexto/panel continúa a cargo del coordinador que los tiene reservados.
