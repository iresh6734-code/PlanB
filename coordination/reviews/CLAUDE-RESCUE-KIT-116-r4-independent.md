# Kit de relevo116 · revisión independiente175 deR4

4/11/2026, Europe/Madrid. **Aceptar116R4 en el alcance de ensayo local revisado.** Revisor Codex distinto de Claude. Los25hashes presentados coinciden antes y después de las comprobaciones. No se editaron fuentes o pruebas de Claude,QA136 ni la caracterización150.

## Protocolo comprobado

R4 sustituye el reclamo obsoleto por el propio mediante archivo temporal y rename,con exclusión de recuperadores y relectura del reclamo. El importador nuevo,que adquiere conwx,no encuentra el hueco que existía entre unlink y take. La recuperación informa errores de dominio sin afirmar estados no comprobados. Un reclamo publicado se conserva;un destino ambiguo no se importa de nuevo. El reintento breve de rename porEPERM/EBUSY/EACCES es acotado y síncrono,no una comparación atómica frente a escritores que ignoren el protocolo.

Tres pruebas propias sobre las fuentes congeladas:

1. Dos procesos reales:recuperador retenido tras verificar destino ausente,después llega importador nuevo. R importa una vez,N obtieneCLAIM_RECOVERY_BUSY. Hay un destino publicado y el reclamo finalimported apunta aR;la exclusión y temporales propios desaparecen,un archivo ajeno queda idéntico. Un reintento devuelveALREADY_IMPORTED. Los dosPIDs de la carrera se observan ausentes.
2. Un reclamo ajeno de propietario vivo sustituye el obsoleto en el hook de verificación. La relectura evita pisarlo,no publica el destino viejo y retira únicamente la exclusión propia.
3. Un destino con marcador propio publicado y reclamoimporting de proceso muerto se consolida comoimported,sin importarlo de nuevo.

Contraprueba privada:solo en la copia se sustituye replaceStale porunlink/take y un hook entre ambas operaciones,con las mismas aserciones. N publica mientrasR espera;R recibeCLAIM_CHECK_FAILED al perder la adquisición y la regresión falla porAssertionError. El wrapper de erroresR4 permanece,por eso **no se afirma reproducir aquí el EEXIST crudo exacto deR3**. No se observan dos destinos en ese control. La fuente se restaura al hash presentado.

## Resultados y fuentes

Corte válido `tests/.tmp/r175-498031ab`:**3/3 propias +72/72 Node de116 repetidas**,typecheck focal limpio,sin omitidas/TODO. Los72 incluyen los casosR2/R3/R4 y estrés del autor;el estrés no sustituye la carrera forzada. No se repitió QA136 completa ni las suites106/115. Sus cifras históricas no se suman a las actuales.

**7/7 DOM del autor repetidas** sobre builds privados del kit y sala,datos ficticios,servidores efímeros y Chromium1228 propio;sin skips/flaky. Cubren relevo real,contraseña/foco,cancelación,recarga fallida,teclado y geometría1440/390/320. Se inspeccionó la captura320:contenido y controles legibles,sin desbordamiento visible. No es auditoría con lector de pantalla.

Además,**1/1 DOM independiente** comprueba la línea nueva deUI:otro cliente hace una importación real antes de la aprobación de la página. La aprobación recibe409real;la alerta conserva el rechazo y el foco,y la lista se actualiza a«ya importada» sin inventar el éxito ni mostrar el paso3. Quitando solo la recarga delcatch en una copia privada deUI,esa misma prueba falla esperando«ya importada». Fuentes originales restauradas;captura de escritorio del caso válido inspeccionada. Esta prueba usa dos clientes de una API real;la carrera multiproceso está cubierta por el casoNode anterior,no por estaUI.

Manifest/result/logs y own-evidence/mutant-evidence conservan fuentes y contraste. DOM-result y dom-processes registran **7servidores directos conclose observado y2destinos descendientes**,todos los9PIDs observados ausentes. No se observaron eventosclose de los dos descendientes desde padres que ya habían terminado;no se afirma cierre ordenado de esos dos. Los casos adicionales deUI ejecutan sus cierres propios,no se suman como otra batería7/7.

## Incidencias del arnés de revisión

El primer corte `tests/.tmp/r175-6a4796fe` tuvo3/3propias y70/72autoras. Mi preloadpreparaba claveskindtest en cualquier directorio con nombre de sala,incluidos señuelos de carpetas ajenas. Eso añadió.planb-key y rompió dos aserciones de inventario/limpieza. No fue un defecto del producto ni se cambiaron las aserciones para acomodarlo.

Se acotó la preparación a un marcador escrito desde server/rescue-room.ts dentro de la raíz nueva de esta revisión. Así se precrean claves de ensayo solo para salas creadas por el servicio,antes deStore,sin cambiarcrypto o fuentes presentadas. La pasada72/72 se hizo en otra raíz. Los dos cortes permanecen.

La primera auditoría de procesosDOM exigía tambiénclose de descendientes registrado por sus padres,ya terminados. Las siete pruebas habían pasado y los nuevePIDs estaban ausentes. Se corrigió el informe de auditoría para distinguir sieteclose directos de dos descendientes ausentes,sin repetir innecesariamente los recorridos ni ocultar el primer resultado de auditoría.

Entorno mínimo,NODE_ENVtest y bloqueo de red externa heredado por hijos;claves nuevaskindtest,noDPAPI. Los datos son nuevos y ficticios,sin cuentas/perfiles de usuario,proveedores reales u otro equipo. Browser plugin/skill browser no disponibles para el flujo de pruebas del repositorio;Playwright CLI.

## Límites y siguiente paso

La aceptación no demuestra imposibilidad universal de duplicación,escritores no cooperantes,otro sistema operativo,disco lleno,corte de energía oRTO/RPO. Se conserva el bloqueo conservador ante.takeover abandonado y propietario vivo de otra instancia;no se libera por antigüedad. Pueden quedar temporales propios tras una caída.

QA136 mantiene su caso histórico del mismoPID,que debe invertirse bajo su reserva para dejar una regresión vigente;no se ha editado ni aceptado por esta revisión. Tampoco se acepta su caracterización verde como prueba del producto corregido. La demo principal161 no monta este kit,y esta aceptación no actualiza un binario instalado ni autoriza lecturas reales deHubSpot.

116 se acepta sobre sus25hashes actuales.175 se presenta para revisión ajena,con sus dos reservas conservadas y sin autoaceptación.
