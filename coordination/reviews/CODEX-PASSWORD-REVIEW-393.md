# Revisión de la contraseña local versionada

## Compatibilidad comprobada

Se cotejaron las cuatro huellas de la presentación. En una base nueva con clave de prueba, la ruta real de acceso aceptó un registro del formato previo y lo cambió a v2 al desbloquear correctamente. El intento con contraseña incorrecta devolvió 401, carecía de cookie de sesión y dejó intacta la fila cifrada. La configuración inicial devolvió 200 y guardó v2.

Al cerrar y crear otra instancia de `createBaseApp` sobre la misma base, la cookie anterior fue rechazada. El acceso correcto devolvió 200 y permitió consultar un recurso protegido. No volvió a escribir la credencial ya migrada. La comparación de persistencia se hizo sobre las huellas de la fila cifrada de SQLite.

## Datos dañados

Un registro v2 ficticio con metadatos que cumplen la comprobación de entero positivo pero que el algoritmo no admite hace que el verificador lance una excepción. El endpoint devuelve 500 en lugar de un rechazo controlado. La fila queda intacta, la respuesta carece de cookie de sesión y la lectura anónima del estado sigue dando 401. Se usó una variación pequeña de los parámetros legítimos.

El verificador acepta también una etiqueta de versión desconocida si los demás campos se conservan y la derivación coincide. Informa que debe migrarla. El tratamiento de versiones debe quedar explícito para que un formato desconocido o dañado no se interprete como formato compatible.

## Corrección pedida

Aceptar explícitamente los perfiles existentes. Validar el formato y los parámetros antes de derivar y convertir el rechazo del algoritmo en una respuesta de acceso controlada. Mantener el identificador de sesión sin emitir y la fila cifrada intacta ante un registro dañado. Conservar la migración transparente del formato previo y repetir la reapertura de la base. Cubrir el caso en el endpoint además de en el verificador.

Los perfiles admitidos deben determinar el coste máximo del verificador. Esta revisión no ejecutó derivaciones de coste elevado. El servicio de equipo y la instalación en uso quedan fuera de este banco.

## Evidencia

Banco `tests/.tmp/review393-394-fdGyVm`, con las fuentes de 391 y los archivos de ambas entregas cotejados. `password-probe.json` registra los estados de las rutas y las comprobaciones de persistencia. `password-suite.log` registra 31/31 en las pruebas de contraseña, refuerzo de acceso, autorización local y padre de autenticación. La revisión solicita R2 conservando la reserva de Claude.
