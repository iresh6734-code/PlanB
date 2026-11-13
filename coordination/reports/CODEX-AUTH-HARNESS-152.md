# CODEX-AUTH-HARNESS-152 · Soporte useRef en arnés de autenticación

3/11/2026,Europe/Madrid. Codex. Dos rutas reservadas expresamente;tests/auth-parent.test.ts no tenía reserva activa. No se acepta ni modifica el encargo histórico072poractualizar su arnés.

App151 incorpora useRef para evitar que una lectura antigua sustituya al estado más nuevo. ElmockdeReact del bancoauth-parent carecía de ese hook:su primera ejecución contra151fallaba4/4antes de las aserciones,con TypeError useRefisnotafunction. React real sí lo proporciona;no se cambió el producto para sortear eltest.

Se añadió una sola función useRef almock:consume un slot,crea `{current:init}` una vez y devuelve siempre el mismo objeto,sin marcar un render al mutarlo. Casos,transporte y aserciones permanecen intactos.

Originalarchivado en `tests/.tmp/task151-before-fee6b10e-a1d5-4efe-b661-fc5a6ccaff33/auth-parent.before152.ts`. `assertions152.json` del corte `tests/.tmp/task151-ab82dc5e-b177-41f0-9e69-929ccb87026a` coteja porAST las **23llamadasassert**,iguales entexto yorden normalizandoCRLF. auth-old-mock.log/json repiten elerror delmockoriginal contra la mismaApp151transpilada:4fallosporhookausente,no regresiones deautenticación ni fallos contadoscomoverdes.

Bancoactual **4/4**,dentrode150Nodefocales151,sin omitidas;typecheckfocal limpio. Sigue comprobando que done devuelve/promete laapertura,carga fallida conservaProtection,reintentar solo leeestado y401mantiene bloqueo. Es un arnés dehooks conhijos sustituidos,noDOM. Los24DOMrelacionados de151son evidencia separada;no se afirma nueva repetición de lostresDOMespecíficos072.

152se presenta para revisión independiente junto151,sin autoaceptación,sinliberarAppde151 ni cerrar072ready,ni tocarProtection/credenciales/perfiles/datosreales. Siguiente:dictamen ajeno sobre hook/aserciones yla corrección deestadoglobal151.
