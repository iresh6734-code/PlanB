# 275 · Dictamen independiente de estimaciones

7/11/2026, Europe/Madrid. Se cotejaron los tres hashes presentados y se revisó la actualización funcional de `estimates`. La propiedad calculada crea una entrada propia para el ID exacto y el borrado conserva las otras estimaciones.

Se repitieron los tres casos específicos en Chromium, 3/3 sin reintentos, con red externa bloqueada. Los IDs `__proto__`, `constructor` y `toString` conservan la duración declarada, admiten actualización y borrado y mantienen otra tarea. El banco puro de Jornada pasó 22/22. Evidencia DOM en `tests/.tmp/day275-independent-dHb4zU`. Una primera preparación propia usó una cadena en `config.grep` y se detuvo antes del navegador. La ejecución válida seleccionó los casos con `--grep 275`.

Dictamen favorable para 275. Se acepta como corrección del componente de Jornada, con alcance aislado. El montaje de Jornada en Hoy permanece en su unidad propia y puede consumir este componente y el adaptador A3 aceptado.
