# Buscador por teclado189 · traspaso

4/11/2026, Europe/Madrid. Unidad189 presentada para revisión independiente. Cambia únicamente WorkspaceSearch y su CSS en producto; no modifica App,LocalOperations,LocalTaskFocus,gestor136/170,U2,API o datos.

## Comportamiento

- Desde el campo de búsqueda:↓enfoca el primer resultado actual y↑el último.
- Entre botones de resultados:↓avanza hasta el último;↑retrocede y,desde el primero,vuelve al campo. Inicio/Fin enfocan los extremos de esa página.
- Enter sigue siendo la activación nativa del botón:reutiliza choose,con la misma apertura por entidad/ID/revisión y validación de fuente. No hay un segundo camino de apertura o guardado.
- El campo conserva Inicio/Fin y los modificadores para editar. No se consumen teclas durante composiciónIME oconCtrl/Alt/Meta/Shift. La comprobaciónIMEautomatizada es sintética,no una prueba completa de un teclado de idioma real.
- Tab/ShiftTab/Escape conservan su comportamiento previo y la restauración del foco al elemento desde el que se abrió.
- La navegación solo está disponible con datos de la clave vigente,fuera de carga oapertura. Consulta los botones habilitados de la página actual y no guarda un índice que pueda trasladarse aotra búsqueda/filtro/página.
- Foco visible con borde,fondo youtline existentes deltema;scrollIntoView nearest para mostrar la fila sinanimación. Ayuda breve enlazada poraria-describedby cuando hayresultados. Se mantienen lista ybotones nativos,no se inventa uncombobox/listbox incompatible con su estructura.

## Montaje y coordinación

WorkspaceSearch ya está montado en App;189no requiere cambiarla. Cuando Claude monte170→U2,no reemplazar la versión189con un snapshotanterior delbuscador. Sus seis rutas están separadas de las de ClaudeA/Bdelplan190. Revisar hashessometidos antesde integrar;no aceptar una mezcla posterior no probada.

Validación de189:proyección delcorteUI158aceptado,manteniendo App yotroscomponentes deese corte;backend/shared delcorte185aceptado;solo WorkspaceSearch/CSS deproducto sobreescritos por189. Manifiesto conserva origen/hash de cada archivo. No se integra LAB036ni nuevasfuentes noidentificadas a raíz de esta proyección;no se editan sus archivos.

La demo181/4595no se actualiza al aceptar189. Una copia que incluya estamejora visible debe prepararse en unidadnueva,conbuild,semilla,carpeta yclave deensayo nuevas,hashes cotejados yrecorrido deApp verificado. No se sobrescribe otra instalación ni se transfieren datos/credenciales históricos.

El testnuevo crea su propio servidor realcompiled,datosficticios y Chromiumsinperfil;no usa4331/4334,MSedge delusuario,serviciosreales o autenticacióncorporativa. El helperrequiere explícitamente fuentecongelada ycarpetanueva por variablesPLANB_K189_SOURCE/ROOT;no sirve como lanzador público/general.
