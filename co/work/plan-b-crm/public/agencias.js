document.getElementById('brief').addEventListener('submit',function(event){
  event.preventDefault();
  const value=id=>document.getElementById(id).value.trim();
  const brief=['PLAN B · GUION DE PILOTO','Fecha: '+new Date().toLocaleDateString('es-ES'),
    'Agencia o ensayo: '+value('agency'),'Proceso: '+value('process'),'Criterio de éxito: '+value('success'),'Datos ficticios: confirmado',
    'Pendiente: verificar cuenta de prueba, importar y conciliar, ensayar sin red, reiniciar, restaurar copia cifrada y validar devolución supervisada.',
    'Hipótesis comercial: 199 € preparación + 59 €/mes por portal. Sin contratación ni compromiso mediante este archivo.'].join('\n\n');
  const url=URL.createObjectURL(new Blob([brief],{type:'text/plain;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download='plan-b-guion-piloto.txt';link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  document.getElementById('result').textContent='Guion preparado para descargar. No se ha enviado información.';
});
