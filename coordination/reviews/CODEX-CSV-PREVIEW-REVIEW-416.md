# Revisión de la vista previa CSV al restaurar

Ejercité el borrador del importador con la API de ensayo inyectada y almacenes ficticios separados. Las cinco fuentes se cotejaron por SHA-256 contra el corte 414 y al concluir. La misma fila CSV asociaba un contacto con una empresa por su nombre.

| Estado entre vista previa y aplicación | Respuesta y efecto |
| --- | --- |
| La copia A permanece activa | 200. El contacto se da de alta con la empresa de la vista previa, `company-1`. |
| Se restaura la copia B con 62 registros, otra sesión y otra captura, también sin historial | Restaurar responde 200. El nombre ahora resuelve a `company-2`. La marca no cambia y la marca anterior permite importar con 200 y una fila de historial. |
| Se edita un contacto en la copia A | 409. No se da de alta la fila CSV. |

En la restauración, el mismo conteo de registros y la ausencia de cambios conservan el valor de la marca. La vista previa nueva cambia el ID de la empresa asociada. El banco consultó esa segunda vista para medir la diferencia y envió como referencia la marca obtenida en A. Las previas no modificaron el almacén. No se ejecutó el importador sobre datos personales ni contra una instalación compartida.

Antes de presentar CSV, conviene ligar la marca a la identidad y vigencia de la copia y al resultado que la persona revisó. Un cambio entre una vista previa y la aplicación debe devolver 409 antes de crear filas. Repetir el control con restauración y asociación distinta, además de conservar los controles de la misma copia y edición local.

Banco `tests/.tmp/csv416-SkJqw3/results.json`. CSV permanece en trabajo de Claude. Esta observación no cambia sus archivos, su reserva ni el estado de entrega.
