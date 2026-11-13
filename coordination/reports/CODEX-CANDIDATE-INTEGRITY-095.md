# CODEX-CANDIDATE-INTEGRITY-095 · Integridad de la candidata completa

1/11/2026, 14:08:59, Europe/Madrid. Presentada para revisión; sin autoaceptación.

## Problema y resultado

REL033 permite verificar una selección de activos de su contrato; su descubrimiento no representa todos los23 artefactos de la candidata REL046 ni todos los activos públicos opacos. Esta herramienta separada compara las fuentes declaradas y el inventario completo runtime del formato planb-candidate-v1. No cambia REL033/REL046, la app o los procesos abiertos.

Uso desde la raíz:

`node scripts/check-release-candidate.mjs --candidate tests/.tmp/release-candidates/candidate-42c5f15c-99a2-4f4d-bd96-275f84c47f0f`

JSON: matches-manifest (código0), different (1) o unverifiable (2). Ayuda e importación no verifican ni ejecutan nada. Rechaza argumentos/rutas no admitidos sin reflejar su contenido.

## Contrato

- Solo lee candidatas con UUID en tests/.tmp/release-candidates dentro de este checkout. Ignora folder/snapshot/runtime absolutos o URLs del manifiesto; deriva las carpetas locales, sin red.
- Valida formato, declaración de los diez checks, flags no aprobada/no desplegada/no elegible, selección explícita y exclusiones sin contradicción. Los checks son declaraciones, no ejecuciones acreditadas por este comando. Cuenta bloqueos declarados sin transformarlos en autorización.
- SHA-256 y tamaño de cada fuente declarada y de cada artefacto, dos pasadas. Runtime sin omisiones o archivos/directorios adicionales. Activos public opacos, sin extensión, espacios, ñ, cero bytes y public/data admitidos con correspondencia exacta a dist. Ambas copias de block-external deben coincidir con su fuente.
- Rutas relativas exactas, casing portátil, sin duplicados/alias, enlaces/junctions, directorios privados o rutas ambiguas. No recorre directorios runtime inesperados ni lee sus archivos. La clasificación public es una convención del builder, no inspección semántica de secretos.
- Metadatos2MiB, fuente2MiB, artefacto16MiB, totales50/64MiB, hasta2000registros por lista y4096entradas de inventario. Descriptor y timestamps/identidad antes/después, lecturas acotadas y manifiesto/inventario releídos. ParserHTML acotado de REL033 comprueba referencias directas del índice; no afirma grafo JS completo.
- Nunca importa/ejecuta código candidato, compila, instala, aprueba o borra. BuildEvidence declared_not_reexecuted, releaseReadiness not_assessed, liveCheckout not_compared y manifestAuthenticity not_verified explícitos.

## Evidencia propia final

**22/22** unitarias,0fail/skip/TODO. Incluyen manipulación, falta/extras, relaciones de activos/guardas con hashes individualmente coherentes, límites fuente/artefacto/HTML, rutas/alias, flags, metadatos, carreras deterministas y CLI0/1/2. Junctions de carpeta realmente creadas y rechazadas. La rama file-symlink usa un shim lstat y no acredita privilegio Windows de enlaces de archivo. Fixtures mecánicas ficticias no son compilaciones de Plan B aunque simulen sus declaraciones.

Log final tests/.tmp/candidate095-verification-20261101-02.log. Primera suite21/21 precede la ampliación de límites/CLI y no se suma. La ejecución anterior a la compactación no tenía resultado recuperable; se comprobó ausencia de proceso antes de esta ejecución registrada. Sintaxis Node de los tres módulos y diff --check acotado sin errores; no cambiosTypeScript, por tanto no nuevo build/typecheck de producto.

Sensibilidad final en D:/AI/Plan-B-CRM-v2.1/source/tests/.tmp/candidate095-e6fad64e-ec49-476f-88cd-1d180ffb6a90:

| Copia mutada | Resultado causal |
| --- | --- |
| Omite archivos runtime inesperados |0/2, falla por matches-manifest indebido al añadir antes/durante la comprobación |
| Omite vinculación public/guardas |0/2, falla por admitir bytes diferentes con hashes locales coherentes |

No son fallos del módulo real o cuatro defectos anteriores; demuestran sensibilidad frente a dos regresiones introducidas. Mutantes e inputs finales preservados fuera de fuentes compartidas. No se suman repeticiones como casos nuevos.

Dos candidatas reales, mismo hash de módulo/CLI que el final, en tests/.tmp/candidate095-a8992250-fd4f-43ed-8067-3a767f21fdc7:

-42c5f15c-99a2-4f4d-bd96-275f84c47f0f:357fuentes/23artefactos comprobados,0issues.
-b82a776b-043b-4f70-a346-fdb9fd07022d:357/23,0issues.

381hashes por candidata (manifiesto+357+23) iguales antes/después. Los logs/JSON unchanged contienen todos los hashes. Los cambios finales posteriores fueron solo ampliar tests; módulo/CLI/parser intactos. Estas candidatas preceden HS029 y no representan automáticamente el checkout vivo. No se reinstalaron ni cambiaron4420/4421.

## Límites

Manifiesto no firmado: una reescritura coherente de declaración y bytes no acredita autenticidad, procedencia del build ni revisión. Fuente declarada no equivale a imagen entera del repositorio. No detecta todo escritor privilegiado que altere/restituya bytes entre observaciones; no bloqueo delSO. Lee inventarios de directorio con APIs síncronas; límite de entradas comprobadas no es garantía de memoria constante del sistema de archivos. No reejecuta tests/logs o verifica firma, aceptación, proveedor remoto o disponibilidad del runtime. Ninguna afirmación de suite global verde o release elegible.

## Hashes

- tools/releases/candidate-integrity.mjs: 6a579eb4d67618d0af17e05af542fffc5e9b8c843f68621440b2c3989dd219dd
- scripts/check-release-candidate.mjs: d34d8b6b8ec17e896655d6bfe5a18970bee8959314d43ebaceea7e767f751910
- tests/candidate-integrity.test.mjs: 565507a9f57b4906df8d4a616d3b774788a3b4fa5584643c43582de45f419ad1
- tools/releases/workspace-manifest.mjs: b79cc11b23c3ca9dcc911d0b24d6c63d8f13fccfa91bda3b195d562472514a0f

El parser es dependencia de lectura, no archivo editado por095. El hash del informe lo registra submit. Reserva exacta de cuatro archivos, sin conflictos registrados con Claude. LAB036 sigue fuera de reserva, separado de esta entrega; no se integra ni se atribuye sesión autora por este informe.
