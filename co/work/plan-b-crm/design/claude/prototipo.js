/* Prototipo local sin conexión (CLAUDE-003).
   Sin red, sin almacenamiento (ni localStorage, sessionStorage, IndexedDB ni cookies), sin dependencias y sin IA.
   Todo el estado vive en memoria y se pierde al recargar. Los datos son campos vacíos: no hay clientes,
   métricas ni conexiones inventados. Enviar, aprobar, ejecutar, conectar o guardar están deshabilitados y explicados.
   La única persistencia aparente es el fragmento de la URL (#vista=…&comp=…), que solo sirve para abrir un estado concreto. */
'use strict';

(() => {
  const VISTAS = ['hoy', 'comercial', 'conexiones'];
  const TITULOS = { hoy: 'Hoy', comercial: 'Comercial', conexiones: 'Conexiones' };
  const COMP_NOMBRE = { A: 'Composición A · Lista operativa', B: 'Composición B · Mesa de preparación' };
  const RECOMENDACION = {
    hoy: 'Para Hoy, el informe CLAUDE-002 recomienda A: la tarea es escoger y una mesa sería ornamento.',
    comercial: 'Para Comercial, el informe CLAUDE-002 recomienda B en escritorio, con degradación a una columna en pantallas estrechas: se lee el contexto mientras se redacta.',
    conexiones: 'Para Conexiones, el informe CLAUDE-002 no recomienda A ni B; se ofrecen ambas para comparar.'
  };

  /* Registros de estructura: solo posiciones vacías. No son clientes. */
  const FILAS = [1, 2, 3].map(n => ({ id: 'r' + n, n, nombre: 'Registro vacío ' + n }));

  /* Capacidades que ya existen en la app (nombres y descripciones de SalesWorkspace). Su estado aquí es siempre «sin comprobar». */
  const CAPS = [
    { id: 'hubspot', nombre: 'HubSpot', desc: 'Capturas, ficha comercial y comparación de cambios.' },
    { id: 'gmail', nombre: 'Gmail', desc: 'Borradores internos y envío con revisión.' },
    { id: 'calendar', nombre: 'Calendar', desc: 'Disponibilidad propia e invitaciones revisadas.' },
    { id: 'drive', nombre: 'Drive', desc: 'Archivos autorizados vinculados a clientes.' },
    { id: 'docs', nombre: 'Docs', desc: 'Propuestas desde borradores y contexto documental.' },
    { id: 'sheets', nombre: 'Sheets', desc: 'Importación con vista previa e informes verificados.' }
  ];

  const dest = b => (b.para.trim() ? '«' + b.para.trim() + '»' : 'un destinatario sin indicar');
  const ACCIONES = [
    { k: 'gmail', etiqueta: 'Enviar seguimiento en Gmail', efecto: b => 'Enviaría un correo a ' + dest(b) + '.' },
    { k: 'calendar', etiqueta: 'Invitar a una reunión en Calendar', efecto: b => 'Invitaría a ' + dest(b) + ' a una reunión; fecha y hora sin definir.' },
    { k: 'tarea', etiqueta: 'Crear una tarea de seguimiento', efecto: () => 'Crearía una tarea de seguimiento sin fecha definida.' },
    { k: 'drive', etiqueta: 'Adjuntar un archivo de Drive', efecto: () => 'Adjuntaría un archivo de Drive; ninguno está seleccionado.' }
  ];

  const MOTIVO_EJECUTAR = 'Aprobar y ejecutar están deshabilitados: autorizarían acciones externas y este prototipo no tiene conexión, cuentas ni permisos. Nada de lo escrito se envía ni se guarda, y no se muestra ningún resultado simulado.';

  /* ---------- Estado (solo en memoria) ---------- */
  const estado = {
    vista: 'hoy',
    comp: 'A',
    datos: 'estructura',
    sel: 'r1',
    abierto: false,
    cap: 'hubspot',
    filtro: '',
    ficha: false,
    fichaFila: 'r1'
  };
  const nuevoBorrador = () => ({ para: '', asunto: '', cuerpo: '', acc: { gmail: false, calendar: false, tarea: false, drive: false }, revisado: false });
  const nuevaProxima = () => ({ titulo: '', fecha: '' });
  const borradores = {};
  const proximas = {};
  FILAS.forEach(f => { borradores[f.id] = nuevoBorrador(); proximas[f.id] = nuevaProxima(); });
  let abridor = null;

  /* ---------- Utilidades ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const fila = id => FILAS.find(f => f.id === id) || FILAS[0];

  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) {
      for (const k of Object.keys(props)) {
        const v = props[k];
        if (v === false || v === null || v === undefined) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, v);
      }
    }
    kids.flat(Infinity).forEach(c => {
      if (c === null || c === undefined || c === false) return;
      el.append(c.nodeType ? c : document.createTextNode(String(c)));
    });
    return el;
  }

  function anunciar(texto) {
    const a = $('#anuncio');
    a.textContent = '';
    setTimeout(() => { a.textContent = texto; }, 30);
  }

  const nd = () => h('span', { class: 'nd', text: 'Sin dato' });
  const sinComprobar = () => h('span', { class: 'tag tag-nc', text: '○ Sin comprobar' });
  const btn = (texto, clase, fn, extra) => h('button', Object.assign({ type: 'button', class: 'btn ' + clase, text: texto, onclick: fn }, extra || {}));
  const hecho = (dt, dd) => h('div', null, h('dt', { text: dt }), h('dd', null, dd));
  const celda = (cls, etiqueta, ...contenido) => h('div', { class: 'celda ' + cls }, h('span', { class: 'lbl', text: etiqueta }), h('div', null, contenido));
  const vacio = (titulo, texto) => h('div', { class: 'vacio' }, h('h2', { text: titulo }), h('p', { text: texto }));
  const seccionCab = (idTitulo, titulo, texto) => h('div', { class: 'seccion-cab' }, h('h2', { id: idTitulo, text: titulo }), texto ? h('p', { text: texto }) : null);

  function campo(id, etiqueta, valor, placeholder, alCambiar, opciones) {
    const o = opciones || {};
    const ctl = o.filas
      ? h('textarea', { id, rows: o.filas, placeholder })
      : h('input', { id, type: o.tipo || 'text', placeholder, maxlength: o.max, inputmode: o.modo, autocomplete: 'off' });
    ctl.value = valor;
    ctl.addEventListener('input', () => alCambiar(ctl.value));
    return h('label', { class: 'campo', for: id }, h('span', { text: etiqueta }), ctl, o.ayuda ? h('small', { text: o.ayuda }) : null);
  }

  /* ---------- Cambios temporales ---------- */
  function sucioBorrador(id) {
    const b = borradores[id];
    return !!(b.para || b.asunto || b.cuerpo || b.revisado || Object.values(b.acc).some(Boolean));
  }
  function sucioFicha(id) { const p = proximas[id]; return !!(p.titulo || p.fecha); }

  function actualizarSucio() {
    $$('[data-sucio]').forEach(el => {
      const [id, parte] = el.dataset.sucio.split(':');
      const sucio = parte === 'ficha' ? sucioFicha(id) : sucioBorrador(id);
      el.textContent = sucio ? 'Cambios temporales: solo existen en esta página.' : 'Sin cambios.';
    });
  }

  function llenarResumen(ul, id) {
    const b = borradores[id];
    const lineas = ACCIONES.filter(a => b.acc[a.k]).map(a => h('li', { text: a.efecto(b) }));
    if (!lineas.length) lineas.push(h('li', { text: 'Ninguna acción externa marcada: solo existiría un borrador, sin envío.' }));
    if ((b.acc.gmail || b.acc.calendar) && !b.para.trim()) lineas.push(h('li', { class: 'aviso', text: 'Falta el destinatario.' }));
    if (b.acc.gmail && (!b.asunto.trim() || !b.cuerpo.trim())) lineas.push(h('li', { class: 'aviso', text: 'El asunto o el cuerpo del correo están vacíos.' }));
    ul.replaceChildren(...lineas);
  }

  const textoNota = id => (borradores[id].revisado
    ? 'Marcado solo en esta página: no aprueba ni autoriza nada.'
    : 'Si cambias algo después de marcarlo, la revisión se desmarca.');
  function pintarNota(id) {
    $$('[data-revnota="' + id + '"]').forEach(el => { el.textContent = textoNota(id); });
  }

  function cambioBorrador(id) {
    const b = borradores[id];
    if (b.revisado) {
      b.revisado = false;
      const cb = document.getElementById('rev-' + id);
      if (cb) cb.checked = false;
      anunciar('Cambió el contenido: se desmarcó «He revisado».');
    }
    $$('[data-resumen="' + id + '"]').forEach(ul => llenarResumen(ul, id));
    pintarNota(id);
    actualizarSucio();
  }

  function restablecerBorrador(id) {
    const habia = sucioBorrador(id);
    borradores[id] = nuevoBorrador();
    anunciar(habia ? 'Campos del borrador restablecidos.' : 'No había cambios que restablecer.');
    render('rest-' + id);
  }
  function restablecerFicha(id) {
    const habia = sucioFicha(id);
    proximas[id] = nuevaProxima();
    pintarFicha();
    anunciar(habia ? 'Campos de la próxima acción restablecidos.' : 'No había cambios que restablecer.');
    const b = document.getElementById('prox-titulo');
    if (b) b.focus();
  }

  /* ---------- Editor de borrador y revisión (compartido por A y B) ---------- */
  function editor(id, modo) {
    const b = borradores[id];
    const f = fila(id);
    const H = modo === 'b' ? 'h3' : 'h4';

    const contexto = h('section', { class: 'banda', 'aria-labelledby': 'hc-' + id },
      h('div', { class: 'banda-cab' },
        h(H, { id: 'hc-' + id, text: 'Contexto' }),
        btn('Abrir ficha', 'btn-sec', ev => abrirFicha(id, ev.currentTarget), { 'aria-label': 'Abrir ficha de ' + f.nombre })),
      h('div', { class: 'ctx-grid' },
        h('dl', { class: 'hechos' },
          hecho('Cliente', f.nombre), hecho('Empresa', nd()), hecho('Oportunidad (etapa)', nd()), hecho('Importe', nd()),
          hecho('Motivo de prioridad', nd()), hecho('Última acción', nd()), hecho('Próxima acción', nd())),
        h('div', { class: 'cronologia' },
          h('p', null, h('strong', { text: 'Cronología' })),
          h('p', { text: 'Sin actividad conservada. La app indicaría el motivo: captura sin tareas, captura antigua o permiso insuficiente. Las notas y los correos no se capturan.' }))));

    const campos = h('div', { class: 'campos' },
      campo('para-' + id, 'Destinatario', b.para, 'Sin destinatario', v => { b.para = v; cambioBorrador(id); }, { modo: 'email' }),
      campo('asu-' + id, 'Asunto', b.asunto, 'Sin asunto', v => { b.asunto = v; cambioBorrador(id); }),
      campo('cue-' + id, 'Cuerpo del mensaje', b.cuerpo, 'Sin texto: escribe aquí para probar el espacio de edición.', v => { b.cuerpo = v; cambioBorrador(id); }, { filas: 8 }));
    const externas = h('fieldset', { class: 'externas' },
      h('legend', { text: 'Acciones externas' }),
      ACCIONES.map(a => h('label', { class: 'chk' },
        h('input', { type: 'checkbox', checked: b.acc[a.k], onchange: ev => { b.acc[a.k] = ev.target.checked; cambioBorrador(id); } }),
        h('span', { text: a.etiqueta }))),
      h('small', { text: 'Marcar solo prepara el resumen de efecto. No ejecuta nada.' }));
    const borrador = h('section', { class: 'banda', 'aria-labelledby': 'hb-' + id },
      h('div', { class: 'banda-cab' },
        h(H, { id: 'hb-' + id, text: 'Borrador' }),
        h('span', { class: 'sucio', 'data-sucio': id + ':borrador' })),
      h('div', { class: 'borrador-grid' }, campos, externas));

    const lista = h('ul', { 'data-resumen': id });
    llenarResumen(lista, id);
    const revision = h('section', { class: 'banda', 'aria-labelledby': 'hr-' + id },
      h(H, { id: 'hr-' + id, text: 'Efecto y revisión' }),
      h('div', { class: 'resumen' }, h('p', null, h('strong', { text: 'Si esto se ejecutara, ocurriría:' })), lista),
      h('p', { class: 'motivo', id: 'motivo-' + id, text: MOTIVO_EJECUTAR }));

    const pie = h('div', { class: 'pie' },
      h('div', { class: 'revision' },
        h('label', { class: 'chk' },
          h('input', { type: 'checkbox', id: 'rev-' + id, checked: b.revisado, onchange: ev => { b.revisado = ev.target.checked; pintarNota(id); actualizarSucio(); } }),
          h('span', { text: 'He revisado el destinatario, las acciones externas y el contenido.' })),
        h('small', { 'data-revnota': id, text: textoNota(id) })),
      h('div', { class: 'botones' },
        btn('Aprobar propuesta', 'btn-pri', null, { disabled: true, 'aria-describedby': 'motivo-' + id }),
        btn('Ejecutar acciones aprobadas', 'btn-sec', null, { disabled: true, 'aria-describedby': 'motivo-' + id }),
        btn('Restablecer campos', 'btn-txt', () => restablecerBorrador(id), { 'data-fk': 'rest-' + id })));

    return h('div', { class: 'editor editor-' + modo }, contexto, borrador, revision, pie);
  }

  /* ---------- Hoy ---------- */
  function renderHoy() {
    const c = $('#cuerpo-hoy');
    c.replaceChildren(
      h('dl', { class: 'metricas' },
        ['Oportunidades abiertas', 'Tareas vencidas', 'Para hoy', 'Propuestas por revisar'].map(t => h('div', null, h('dt', { text: t }), h('dd', null, nd())))),
      h('p', { class: 'franja' }, h('strong', { text: 'Compromisos de hoy' }), h('span', { text: 'Sin tareas que mostrar. En la app esto solo pasa a ser un lateral cuando hay tareas.' })));
    if (estado.datos === 'vacio') {
      c.append(vacio('Sin captura de oportunidades', 'No hay oportunidades abiertas capturadas, así que no hay seguimientos que ordenar. En la app se distinguirá una captura sin tareas de una captura antigua o de un permiso insuficiente. Este espacio no reserva ninguna columna para un vacío.'));
      return;
    }
    c.append(estado.comp === 'A' ? hoyA() : hoyB());
  }

  function hoyA() {
    const cab = h('li', { class: 'fila-cab prio-cab', 'aria-hidden': 'true' },
      h('span', { text: '#' }), h('span', { text: 'Cliente y empresa' }), h('span', { text: 'Motivo' }),
      h('span', { text: 'Etapa e importe' }), h('span', { text: 'Días sin contacto' }), h('span', { text: 'Acción', class: 'ac-der' }));
    const filas = FILAS.map(f => h('li', { class: 'fila prio', 'data-id': f.id },
      h('div', { class: 'c-rk' }, h('span', { class: 'lbl', text: 'Prioridad' }), h('span', { class: 'rk', text: String(f.n) })),
      celda('c-who', 'Cliente y empresa', h('strong', { text: f.nombre }), h('div', { class: 'meta' }, 'Empresa: ', nd())),
      celda('c-why', 'Motivo', nd(), h('div', { class: 'meta', text: 'Sin captura de actividad' })),
      celda('c-stage', 'Etapa e importe', 'Etapa: ', nd(), h('br'), 'Importe: ', nd()),
      celda('c-days', 'Días sin contacto', nd()),
      h('div', { class: 'c-act acciones' },
        btn('Abrir ficha', 'btn-sec', ev => abrirFicha(f.id, ev.currentTarget), { 'aria-label': 'Abrir ficha de ' + f.nombre }),
        btn('Preparar seguimiento', 'btn-pri', () => irAComercial(f.id), { 'aria-label': 'Preparar seguimiento de ' + f.nombre, 'data-fk': 'prep-' + f.id }))));
    return h('section', { 'aria-labelledby': 'h-prio', class: 'bloque' },
      seccionCab('h-prio', 'Seguimientos que conviene preparar', 'Oportunidades abiertas sin una tarea pendiente en los próximos siete días. Cada fila lleva su motivo, su dato de orden y su propia acción. El orden real saldría de lo capturado; aquí las posiciones están vacías.'),
      h('ul', { class: 'filas', 'aria-label': 'Lista de prioridades' }, cab, filas),
      h('p', { class: 'meta', text: '«Preparar seguimiento» solo navega a Comercial en este prototipo: no crea ningún borrador ni propuesta.' }));
  }

  function hoyB() {
    const sel = fila(estado.sel);
    const cola = h('section', { class: 'cola', 'aria-labelledby': 'h-cola' },
      h('h2', { id: 'h-cola', text: 'Cola de seguimientos' }),
      h('ul', { class: 'cola-lista' }, FILAS.map(f => h('li', { 'data-id': f.id },
        h('button', { type: 'button', class: 'cola-item', 'aria-current': f.id === sel.id ? 'true' : false, 'data-fk': 'cola-' + f.id, onclick: () => { estado.sel = f.id; render('cola-' + f.id); } },
          h('span', { class: 'rk', text: String(f.n) }), h('strong', { text: f.nombre }), h('small', { text: 'Motivo: sin dato' }))))),
      selector('h'));
    const detalle = h('section', { class: 'detalle detalle-hoy', 'aria-labelledby': 'h-sig' },
      h('div', { class: 'detalle-cab' },
        h('div', null, h('h2', { id: 'h-sig', text: 'Siguiente seguimiento' }), h('p', { class: 'meta', text: sel.nombre + ' · prioridad ' + sel.n })),
        h('div', { class: 'acciones' },
          btn('Abrir ficha', 'btn-sec', ev => abrirFicha(sel.id, ev.currentTarget), { 'aria-label': 'Abrir ficha de ' + sel.nombre }),
          btn('Preparar seguimiento', 'btn-pri', () => irAComercial(sel.id), { 'aria-label': 'Preparar seguimiento de ' + sel.nombre }))),
      h('dl', { class: 'hechos' },
        hecho('Motivo de prioridad', nd()), hecho('Etapa', nd()), hecho('Importe', nd()),
        hecho('Días sin contacto', nd()), hecho('Última acción', nd()), hecho('Próxima acción', nd())),
      h('p', { class: 'nota', text: 'El orden real saldría del motivo, la etapa, el importe y la antigüedad capturados. Sin esos datos este espacio queda vacío en lugar de inventarlos.' }),
      h('p', { class: 'meta', text: '«Preparar seguimiento» solo navega a Comercial en este prototipo: no crea ningún borrador ni propuesta.' }));
    return h('div', { class: 'mesa' }, cola, detalle);
  }

  function selector(prefijo) {
    const sel = h('select', { id: 'sel-' + prefijo, 'data-fk': 'sel-' + prefijo, onchange: ev => { estado.sel = ev.target.value; render('sel-' + prefijo); } },
      FILAS.map(f => h('option', { value: f.id, selected: f.id === estado.sel, text: f.nombre })));
    return h('label', { class: 'campo cola-sel' }, h('span', { text: 'Cliente' }), sel);
  }

  /* ---------- Comercial ---------- */
  function buscador() {
    const input = h('input', { type: 'search', id: 'buscar', autocomplete: 'off', placeholder: 'Nombre del registro' });
    input.value = estado.filtro;
    input.addEventListener('input', () => { estado.filtro = input.value; aplicarFiltro(); });
    return h('label', { class: 'campo busqueda', for: 'buscar' }, h('span', { text: 'Buscar cliente' }), input,
      h('small', { text: 'En la app se busca por nombre, empresa o correo. Aquí solo filtra por el nombre del registro.' }));
  }

  function aplicarFiltro() {
    const q = estado.filtro.trim().toLowerCase();
    let visibles = 0;
    $$('[data-id]').forEach(el => {
      if (!el.closest('#cuerpo-comercial')) return;
      const coincide = !q || fila(el.dataset.id).nombre.toLowerCase().includes(q);
      el.hidden = !coincide;
      if (coincide && (el.classList.contains('acordeon-item'))) visibles++;
      if (coincide && el.closest('.cola-lista')) visibles++;
    });
    $$('#sel-c option').forEach(o => { o.hidden = !!q && !fila(o.value).nombre.toLowerCase().includes(q); });
    const aviso = $('#sin-resultados');
    if (aviso) aviso.hidden = !q || visibles > 0;
  }

  function renderComercial() {
    const c = $('#cuerpo-comercial');
    c.replaceChildren();
    if (estado.datos === 'vacio') {
      c.append(vacio('Sin clientes cargados', 'No hay capturas que mostrar. Esta composición no reserva una columna para un vacío: el espacio se usa para explicarlo. En la app aquí aparecería el buscador de clientes por nombre, empresa o correo.'));
      return;
    }
    c.append(estado.comp === 'A' ? comA() : comB());
  }

  function comA() {
    const items = FILAS.map(f => {
      const abierto = estado.abierto && estado.sel === f.id;
      return h('li', { class: 'acordeon-item', 'data-id': f.id },
        h('h3', null,
          h('button', {
            type: 'button', class: 'acordeon-btn', id: 'ab-' + f.id, 'aria-expanded': String(abierto), 'aria-controls': 'panel-' + f.id, 'data-fk': 'ab-' + f.id,
            onclick: () => { if (abierto) estado.abierto = false; else { estado.sel = f.id; estado.abierto = true; } render('ab-' + f.id); }
          },
          h('strong', { text: f.nombre }),
          h('small', { text: 'Empresa: sin dato · Etapa: sin dato · Último contacto: sin dato' }),
          h('span', { class: 'chev', 'aria-hidden': 'true', text: abierto ? 'Contraer ▴' : 'Desplegar ▾' }))),
        h('div', { class: 'panel', id: 'panel-' + f.id, role: 'region', 'aria-labelledby': 'ab-' + f.id, hidden: !abierto }, editor(f.id, 'a')));
    });
    return h('section', { class: 'bloque', 'aria-labelledby': 'h-clientes' },
      seccionCab('h-clientes', 'Clientes', 'Elige un cliente y se despliega aquí mismo su contexto, el borrador y la revisión.'),
      buscador(),
      h('ul', { class: 'filas', 'aria-label': 'Lista de clientes' }, items),
      h('p', { class: 'sin-resultados', id: 'sin-resultados', role: 'status', hidden: true, text: 'Ningún registro coincide con la búsqueda.' }));
  }

  function comB() {
    const f = fila(estado.sel);
    const cola = h('section', { class: 'cola', 'aria-labelledby': 'h-clientes' },
      h('h2', { id: 'h-clientes', text: 'Clientes' }),
      buscador(),
      h('ul', { class: 'cola-lista', 'aria-label': 'Lista de clientes' }, FILAS.map(x => h('li', { 'data-id': x.id },
        h('button', { type: 'button', class: 'cola-item', 'aria-current': x.id === f.id ? 'true' : false, 'data-fk': 'cola-' + x.id, onclick: () => { estado.sel = x.id; render('cola-' + x.id); } },
          h('span', { class: 'rk', text: String(x.n) }), h('strong', { text: x.nombre }), h('small', { text: 'Empresa: sin dato' }))))),
      selector('c'),
      h('p', { class: 'sin-resultados', id: 'sin-resultados', role: 'status', hidden: true, text: 'Ningún registro coincide con la búsqueda.' }));
    const detalle = h('section', { class: 'detalle', 'aria-labelledby': 'h-det' },
      h('div', { class: 'detalle-cab' },
        h('div', null, h('h2', { id: 'h-det', text: f.nombre }), h('p', { class: 'meta', text: 'Empresa: sin dato · Etapa: sin dato' }))),
      editor(f.id, 'b'));
    return h('div', { class: 'mesa' }, cola, detalle);
  }

  /* ---------- Conexiones ---------- */
  function renderConexiones() {
    const c = $('#cuerpo-conexiones');
    const leyenda = h('dl', { class: 'leyenda' },
      h('div', null, h('dt', { text: 'Configurada' }), h('dd', { text: 'La aplicación dispone de los ajustes para conectar el servicio.' })),
      h('div', null, h('dt', { text: 'Autorizada' }), h('dd', { text: 'Una cuenta concedió permisos. No prueba que cada operación funcione.' })),
      h('div', null, h('dt', { text: 'Alcance' }), h('dd', { text: 'Si la capacidad solo lee o también escribe.' })),
      h('div', null, h('dt', { text: 'Verificada con operación' }), h('dd', { text: 'Una operación concreta se ejecutó y se comprobó, con fecha y alcance.' })));
    c.replaceChildren(
      h('p', { class: 'nota', text: 'Esta pantalla no consulta ninguna conexión. «Sin comprobar» significa que el prototipo no tiene información, no que algo falle.' }),
      leyenda,
      h('div', { class: 'cab-acc' },
        btn('Conectar o autorizar una cuenta', 'btn-pri', null, { disabled: true, 'aria-describedby': 'motivo-conectar' }),
        h('p', { class: 'motivo', id: 'motivo-conectar', text: 'Deshabilitado: conectar o autorizar entrega permisos a una cuenta real. Este prototipo no tiene conexión ni credenciales y no simula una autorización.' })),
      estado.comp === 'A' ? conA() : conB());
  }

  function conA() {
    const cab = h('li', { class: 'fila-cab caps-cab', 'aria-hidden': 'true' },
      ['Capacidad', 'Configuración', 'Autorización', 'Alcance', 'Evidencia de una operación'].map(t => h('span', { text: t })));
    const filas = CAPS.map(k => h('li', { class: 'fila caps' },
      celda('c-cap', 'Capacidad', h('strong', { text: k.nombre }), h('p', { class: 'meta', text: k.desc })),
      celda('c-cfg', 'Configuración', sinComprobar()),
      celda('c-aut', 'Autorización', sinComprobar()),
      celda('c-alc', 'Alcance', 'Lectura: ', nd(), h('br'), 'Escritura: ', nd()),
      celda('c-evi', 'Evidencia de una operación', sinComprobar(), h('div', { class: 'meta', text: 'Sin operación, fecha ni alcance registrados' }))));
    return h('section', { class: 'bloque', 'aria-labelledby': 'h-caps' },
      seccionCab('h-caps', 'Capacidades', 'Una fila por capacidad y cuatro respuestas distintas, no una sola insignia.'),
      h('ul', { class: 'filas', 'aria-label': 'Capacidades de conexión' }, cab, filas));
  }

  function conB() {
    const k = CAPS.find(x => x.id === estado.cap) || CAPS[0];
    const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Capacidad' },
      CAPS.map(x => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(x.id === k.id), 'data-fk': 'chip-' + x.id, text: x.nombre, onclick: () => { estado.cap = x.id; render('chip-' + x.id); } })));
    const estados = h('div', { class: 'estados' },
      h('div', { class: 'estado' }, h('h3', { text: 'Configuración' }), sinComprobar(), h('p', { text: 'En la app: si existen los ajustes para conectar este servicio.' })),
      h('div', { class: 'estado' }, h('h3', { text: 'Autorización' }), sinComprobar(), h('p', { text: 'En la app: qué cuenta concedió permisos y cuándo. Una autorización no acredita que cada operación funcione.' })),
      h('div', { class: 'estado' }, h('h3', { text: 'Alcance' }), h('p', null, 'Lectura: ', nd(), h('br'), 'Escritura: ', nd())),
      h('div', { class: 'estado' }, h('h3', { text: 'Evidencia de una operación' }), sinComprobar(), h('p', { text: 'En la app: la última operación comprobada, con fecha y alcance. Sin ella no se muestra «verificada».' })));
    return h('section', { class: 'bloque', 'aria-labelledby': 'h-cap-sel' },
      seccionCab('h-cap-sel', 'Capacidades', 'Elige una capacidad para ver sus cuatro estados por separado.'),
      chips,
      h('div', { class: 'detalle' }, h('div', null, h('h2', { id: 'h-cap-det', text: k.nombre }), h('p', { class: 'meta', text: k.desc })), estados));
  }

  /* ---------- Ficha lateral ---------- */
  function pintarFicha() {
    const id = estado.fichaFila;
    const f = fila(id);
    const p = proximas[id];
    $('#ficha-titulo').textContent = 'Ficha de ' + f.nombre;
    $('#ficha-cuerpo').replaceChildren(
      h('div', { class: 'sec-cab' }, h('span', { class: 'tag tag-nc', text: '○ Prototipo · sin captura' }), h('small', { text: 'Sin fecha de captura' })),
      h('p', { class: 'ayuda', text: 'Solo estructura. Los datos reales saldrían de una captura guardada, con su origen y su fecha. Abrir una ficha no consulta servicios externos.' }),
      h('dl', { class: 'hechos' }, hecho('Empresa', nd()), hecho('Correo', nd()), hecho('Teléfono', nd()), hecho('Responsable', nd())),

      h('section', { 'aria-labelledby': 'f-op' },
        h('div', { class: 'sec-cab' },
          h('h3', { id: 'f-op', text: 'Oportunidades' }),
          btn('Preparar seguimiento', 'btn-sec', null, { disabled: true, 'aria-describedby': 'causas-prep' })),
        h('p', { class: 'motivo', id: 'causas-prep', text: 'Deshabilitado: este prototipo no tiene fuente comercial ni conexión. En la app, cada causa de bloqueo se mostraría aquí.' }),
        h('ul', { class: 'causas' },
          h('li', { text: 'Hay una operación en curso.' }),
          h('li', { text: 'El acceso es de solo lectura.' }),
          h('li', { text: 'La ficha no corresponde a la fuente comercial activa.' }),
          h('li', { text: 'El contacto no tiene correo en los datos guardados.' })),
        h('p', { class: 'ayuda', text: 'No hay oportunidades vinculadas en estos datos.' }),
        btn('Ir al borrador en Comercial', 'btn-txt', () => irAComercial(id))),

      h('section', { 'aria-labelledby': 'f-px' },
        h('div', { class: 'sec-cab' }, h('h3', { id: 'f-px', text: 'Próxima acción' }), h('span', { class: 'tag tag-info', text: 'Edición temporal' })),
        h('div', { class: 'campos-ficha' },
          campo('prox-titulo', 'Qué hay que hacer', p.titulo, 'Sin acción', v => { p.titulo = v; actualizarSucio(); }, { max: 200 }),
          campo('prox-fecha', 'Fecha y hora local', p.fecha, '', v => { p.fecha = v; actualizarSucio(); }, { tipo: 'datetime-local' })),
        h('div', { class: 'acciones' },
          btn('Guardar próxima acción', 'btn-pri', null, { disabled: true, 'aria-describedby': 'motivo-guardar' }),
          btn('Restablecer campos', 'btn-txt', () => restablecerFicha(id))),
        h('p', { class: 'motivo', id: 'motivo-guardar', text: 'No se guarda: el prototipo no tiene base de datos. Lo que escribas queda solo en esta página hasta que recargues.' }),
        h('small', { class: 'sucio', 'data-sucio': id + ':ficha' })),

      h('section', { 'aria-labelledby': 'f-ac' },
        h('h3', { id: 'f-ac', text: 'Actividad guardada' }),
        h('p', { class: 'ayuda', text: 'Sin actividad conservada para este cliente. En la app se explicaría por qué: captura sin tareas, captura antigua o permiso insuficiente. Las notas y los correos no se capturan, y las fechas CRM indican vencimiento, no un historial completo.' })));
    actualizarSucio();
  }

  function abrirFicha(id, opener) {
    estado.ficha = true;
    estado.fichaFila = id;
    abridor = opener || null;
    pintarFicha();
    $('#overlay').hidden = false;
    $('#app').inert = true;
    $('#ficha').scrollTop = 0;
    $('#ficha-titulo').focus();
    actualizarHash();
    anunciar('Ficha abierta. Pulsa Escape para cerrar.');
  }

  function cerrarFicha(restaurarFoco = true) {
    if (!estado.ficha) return;
    estado.ficha = false;
    $('#overlay').hidden = true;
    $('#app').inert = false;
    if (restaurarFoco) {
      const destino = abridor && abridor.isConnected ? abridor : $('#t-' + estado.vista);
      destino.focus();
      anunciar('Ficha cerrada.');
    }
    abridor = null;
    actualizarHash();
  }

  /* ---------- Navegación ---------- */
  function ir(vista) {
    if (estado.ficha) cerrarFicha(false);
    estado.vista = vista;
    render();
    const raiz = window.matchMedia('(max-width: 899px)').matches ? $('#app') : $('#principal');
    raiz.scrollTop = 0;
    $('#t-' + vista).focus();
    anunciar('Vista ' + TITULOS[vista] + ', ' + COMP_NOMBRE[estado.comp]);
  }

  function irAComercial(id) {
    if (estado.ficha) cerrarFicha(false);
    estado.vista = 'comercial';
    estado.sel = id;
    estado.abierto = true;
    render();
    const destino = document.getElementById('para-' + id) || $('#t-comercial');
    destino.focus();
    anunciar('Comercial: borrador de ' + fila(id).nombre + '. Aún no existe ninguna propuesta.');
  }

  /* ---------- Orquestación ---------- */
  function render(foco) {
    VISTAS.forEach(v => { $('#vista-' + v).hidden = v !== estado.vista; });
    $$('.nav-btn').forEach(b => {
      if (b.dataset.vista === estado.vista) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    $$('input[name="comp"]').forEach(i => { i.checked = i.value === estado.comp; });
    $$('input[name="datos"]').forEach(i => { i.checked = i.value === estado.datos; });
    $('#recomendacion').textContent = RECOMENDACION[estado.vista];
    $$('[data-comp-etq]').forEach(e => { e.textContent = COMP_NOMBRE[estado.comp]; });
    document.title = TITULOS[estado.vista] + ' · Prototipo sin conexión';

    if (estado.vista === 'hoy') renderHoy();
    else if (estado.vista === 'comercial') renderComercial();
    else renderConexiones();

    aplicarFiltro();
    actualizarSucio();
    actualizarHash();
    if (foco) {
      const el = document.querySelector('[data-fk="' + foco + '"]');
      if (el) el.focus();
    }
  }

  /* El fragmento de la URL solo permite abrir un estado concreto (p. ej. para una captura). No es almacenamiento. */
  function leerHash() {
    try {
      const p = new URLSearchParams(location.hash.replace(/^#/, ''));
      if (VISTAS.includes(p.get('vista'))) estado.vista = p.get('vista');
      if (['A', 'B'].includes(p.get('comp'))) estado.comp = p.get('comp');
      if (['estructura', 'vacio'].includes(p.get('datos'))) estado.datos = p.get('datos');
      if (FILAS.some(f => f.id === p.get('sel'))) estado.sel = p.get('sel');
      if (CAPS.some(k => k.id === p.get('cap'))) estado.cap = p.get('cap');
      estado.abierto = p.get('abierto') === '1';
      return p.get('ficha') === '1';
    } catch (e) { return false; }
  }

  function actualizarHash() {
    try {
      const p = new URLSearchParams({ vista: estado.vista, comp: estado.comp, datos: estado.datos, sel: estado.sel, cap: estado.cap });
      if (estado.abierto) p.set('abierto', '1');
      if (estado.ficha) p.set('ficha', '1');
      history.replaceState(null, '', '#' + p.toString());
    } catch (e) { /* abrir como archivo local puede restringir la API; no afecta al prototipo */ }
  }

  /* ---------- Eventos ---------- */
  $$('.nav-btn').forEach(b => b.addEventListener('click', () => ir(b.dataset.vista)));
  $$('input[name="comp"]').forEach(i => i.addEventListener('change', () => {
    estado.comp = i.value;
    render();
    anunciar(COMP_NOMBRE[estado.comp]);
  }));
  $$('input[name="datos"]').forEach(i => i.addEventListener('change', () => {
    estado.datos = i.value;
    render();
    anunciar(i.value === 'vacio' ? 'Estado de datos: sin capturas.' : 'Estado de datos: estructura con campos vacíos.');
  }));
  $('#ficha-cerrar').addEventListener('click', () => cerrarFicha());
  $('#overlay').addEventListener('click', ev => { if (ev.target === $('#overlay')) cerrarFicha(); });

  document.addEventListener('keydown', ev => {
    if (!estado.ficha) return;
    if (ev.key === 'Escape') { ev.preventDefault(); cerrarFicha(); return; }
    if (ev.key !== 'Tab') return;
    const dentro = $$('button:not([disabled]), input:not([disabled]), select, textarea, [href]', $('#ficha'));
    if (!dentro.length) return;
    const primero = dentro[0];
    const ultimo = dentro[dentro.length - 1];
    const activo = document.activeElement;
    if (ev.shiftKey && (activo === primero || activo === $('#ficha-titulo') || activo === $('#ficha'))) { ev.preventDefault(); ultimo.focus(); }
    else if (!ev.shiftKey && activo === ultimo) { ev.preventDefault(); primero.focus(); }
  });

  window.addEventListener('hashchange', () => {
    const quiereFicha = leerHash();
    if (estado.ficha) cerrarFicha(false);
    render();
    if (quiereFicha && estado.datos === 'estructura') abrirFicha(estado.sel, null);
  });

  /* ---------- Arranque ---------- */
  const quiereFicha = leerHash();
  render();
  if (quiereFicha && estado.datos === 'estructura') abrirFicha(estado.sel, null);
})();
