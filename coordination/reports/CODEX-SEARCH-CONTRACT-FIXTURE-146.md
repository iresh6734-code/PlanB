# CODEX-SEARCH-CONTRACT-FIXTURE-146 · Fixture de auditoría compatible con identidad145

2/11/2026,Europe/Madrid. Codex. Dos rutas reservadas expresamente;el bancoQA060estaba libre de reservas activas. No se edita un informe histórico deClaude ni se toma su trabajo enrevisión. Se presenta146,sin autoaceptar.

El componente WorkspaceSearch ahora exige un contexto procedente del estado deApp. Mantener una excepción insegura para sus fixtures antiguas habría debilitado la corrección143/145. Se actualizó tests/independent-workspace-contracts.test.ts solo en el arnés y datos públicos ficticios:

-ContextoUUID/cuenta/captura/contextRevision añadido a respuestas yprops.
-Resolvedor de imports relativo al archivo que los solicita,en vez de asumir siempre srccomo origen. Los paquetes comoZod se cargan concreateRequire desde las dependencias existentes,sin instalación.
-Ninguna aserción,caso,Todooexpectativa de rango se elimina orelaja. Se conservan también losmanejadoresviejos yA→B→A.

El original se archiva en `tests/.tmp/search145-before-1736edc6-ac80-4924-9a60-6159b93868f6/independent-workspace-contracts.before146.ts`,con baselineSHAen tablón146. La regresión078 se adapta bajo su propia reserva,únicamente en la identidad ficticia/propexpectedContext;su informepropio se actualiza por separado.

ComparaciónAST `fixture-assertions.json` del snapshot `tests/.tmp/search145-2467b143-69ee-46db-89e1-9a21d593abb3`:183llamadasassert delbanco146y7de078son textualmente idénticas aloriginal normalizandoCRLF. No es solo igualdad de recuentos:se coteja el texto de cada llamada enorden.

**32/32 delbanco146 y1/1de078 pasan** dentrodel150focal final de145,typecheckfocal limpio. Contraprueba con componente delbaseline075: A18,A18by078fallan3/3 por rango21–3/offset20. Ningún fallo de importación,timeout ocomponente sustitutivo. El mismobancoautoresolviendoimports ejecuta el código actual y el viejo;no se mockea la función corregida.

Los casos son lógica/API/arnésdehooks según sus comentarios originales,noReactDOM. La comprobaciónDOM de145 es separada11/11. No se reinterpreta la aceptación históricaQA060/079 como una aceptación deesta modificación ni de053actual. Se conservan eloriginal,elbaseline yloslogs. Sin cambios aHelpersdeotroautor,dependencias,códigoProducto deestaunidad,cuentas oinstalaciones. Siguiente:revisión ajena146junto145y078;noautoaceptación.
