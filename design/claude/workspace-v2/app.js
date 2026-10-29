/*
 * Plan B · Mesa de trabajo comercial · prototipo de interfaz (CLAUDE-UI-010)
 *
 * Sin bibliotecas, sin red, sin almacenamiento del navegador, sin eval y sin innerHTML.
 * Todo el contenido se escribe con textContent / nodos DOM. Todo vive en memoria.
 *
 * Estructura:
 *   1. Núcleo puro (datos de muestra, selectores, transiciones `reduce`). Se publica en
 *      `globalThis.PBWorkspace` (y en `module.exports` si el cargador es CommonJS) para
 *      comprobar las transiciones sin navegador.
 *   2. Interfaz (solo si existe `document`): construye el DOM a partir del estado y
 *      traduce eventos en acciones `dispatch`.
 */
(function (global) {
  'use strict';

  /* =====================================================================
   * 1. NÚCLEO
   * ===================================================================== */

  var MANUAL_ID = '__manual__';
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var STALE_DAYS = 45;

  var SCENARIOS = [
    { id: 'empty', label: 'Vacío', desc: 'Sin captura ni clientes. Es el estado real de este prototipo.' },
    { id: 'loading', label: 'Carga', desc: 'Simula una consulta en curso; no se muestran datos.' },
    { id: 'error', label: 'Error', desc: 'Simula un fallo de carga; la selección válida se conserva.' },
    { id: 'readonly', label: 'Solo lectura', desc: 'Casos de muestra con acceso de solo lectura al origen.' },
    { id: 'stale', label: 'Origen desactualizado', desc: 'Casos de muestra con una captura de hace ' + STALE_DAYS + ' días.' },
    { id: 'sample', label: 'Datos de muestra', desc: 'Casos de interfaz rotulados como muestra.' }
  ];
  var DATA_SCENARIOS = ['sample', 'readonly', 'stale'];

  var WORKSPACES = [
    { id: 'a', name: 'Espacio A (prototipo)' },
    { id: 'b', name: 'Espacio B (prototipo)' }
  ];

  var CAPABILITIES = [
    {
      id: 'correo', label: 'Correo',
      reason: 'No hay conexión con un servicio de correo en este prototipo.',
      effect: 'Enviaría el mensaje al destinatario indicado desde una cuenta autorizada.',
      fields: null
    },
    {
      id: 'reunion', label: 'Reunión',
      reason: 'No hay conexión con un calendario en este prototipo.',
      effect: 'Crearía un evento e invitaría a los participantes.',
      fields: [
        { id: 'titulo', label: 'Título de la reunión' },
        { id: 'fecha', label: 'Fecha', type: 'date' },
        { id: 'hora', label: 'Hora', type: 'time' },
        { id: 'participantes', label: 'Participantes' }
      ]
    },
    {
      id: 'documento', label: 'Documento',
      reason: 'No hay conexión con un almacén de documentos en este prototipo.',
      effect: 'Crearía un archivo en la carpeta del cliente.',
      fields: [
        { id: 'nombre', label: 'Nombre del documento' },
        { id: 'carpeta', label: 'Carpeta de destino' }
      ]
    },
    {
      id: 'informe', label: 'Informe',
      reason: 'No hay conexión con un servicio de informes en este prototipo.',
      effect: 'Generaría un informe y lo asociaría al cliente.',
      fields: null
    }
  ];

  /* ---------- utilidades de texto y fecha ---------- */

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function localISO(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  function parseISO(iso) {
    var p = String(iso).split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  function addDays(iso, n) {
    var d = parseISO(iso);
    return localISO(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
  }

  function fmtDate(iso) {
    if (!iso) return '';
    try {
      return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }).format(parseISO(iso));
    } catch (e) { return iso; }
  }

  function fmtTime(isoDateTime) {
    try {
      return new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(new Date(isoDateTime));
    } catch (e) { return ''; }
  }

  function norm(s) {
    return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  /* ---------- datos de muestra (solo existen en este prototipo) ---------- */

  var TASK_TITLES = [
    'Confirmar la recepción de la propuesta',
    'Pedir fecha para una reunión',
    'Revisar condiciones pendientes',
    'Enviar resumen de la última conversación'
  ];
  var TASK_REASONS = [
    'Sin respuesta registrada tras la última captura',
    'La conversación quedó en pausa',
    'Condiciones sin cerrar según la captura',
    'Resumen prometido y no registrado'
  ];
  var OPP_STAGES = ['Etapa de muestra: contacto inicial', 'Etapa de muestra: propuesta', 'Etapa de muestra: negociación'];
  var ACTIVITY_TEXTS = [
    'Nota conservada de la captura (muestra)',
    'Llamada registrada en la captura (muestra)',
    'Correo registrado en la captura (muestra)'
  ];

  function makeClient(ws, n, today, captured) {
    var tag = pad(n);
    var name = 'Contacto de muestra ' + tag;
    var email = 'contacto-' + (ws === 'a' ? '' : 'b-') + tag + '@example.invalid';
    var company = ws === 'a' ? 'Empresa de muestra ' + pad(((n - 1) % 40) + 1) : 'Empresa de muestra (espacio B)';
    var access = 'edit';
    var originActive = true;
    var hasOpp = true;
    var taskOffset = null;

    if (ws === 'a') {
      if (n % 4 === 1) taskOffset = (n % 9) - 3;
      if (n % 11 === 0) email = null;
      if (n % 13 === 0) hasOpp = false;
      if (n === 1) taskOffset = -3;
      if (n === 2) { email = null; taskOffset = 2; }
      if (n === 3) { hasOpp = false; taskOffset = 1; }
      if (n === 4) { access = 'read'; taskOffset = 3; }
      if (n === 5) { name = null; email = 'sin-nombre-05@example.invalid'; taskOffset = null; }
      if (n === 6) { originActive = false; taskOffset = 4; }
    } else {
      if (n <= 2) taskOffset = n;
      if (n === 3) email = null;
      if (n === 4) hasOpp = false;
    }

    var id = ws + '-' + tag;
    var tasks = [];
    if (taskOffset !== null) {
      tasks.push({
        id: id + '-t1',
        title: TASK_TITLES[n % 4],
        reason: TASK_REASONS[n % 4],
        due: addDays(today, taskOffset),
        status: 'pending'
      });
    }
    var opps = [];
    if (hasOpp) {
      opps.push({ id: id + '-o1', name: 'Oportunidad de muestra ' + tag + '-A', stage: OPP_STAGES[n % 3] });
      if (n % 5 === 0) opps.push({ id: id + '-o2', name: 'Oportunidad de muestra ' + tag + '-B', stage: OPP_STAGES[(n + 1) % 3] });
    }
    var activity = [{ id: id + '-a1', text: ACTIVITY_TEXTS[n % 3], date: addDays(captured, -((n % 20) + 1)) }];
    if (n % 2 === 0) activity.push({ id: id + '-a2', text: ACTIVITY_TEXTS[(n + 1) % 3], date: addDays(captured, -((n % 20) + 8)) });

    return {
      id: id, name: name, company: company, email: email, access: access, originActive: originActive,
      source: 'Muestra del prototipo', opportunities: opps, tasks: tasks, activity: activity
    };
  }

  var datasetCache = {};
  function datasetFor(state) {
    var ws = state.workspaceId;
    var key = ws + '|' + state.today;
    if (!datasetCache[key]) {
      var count = ws === 'a' ? 240 : 5;
      var captured = addDays(state.today, ws === 'a' ? -2 : -4);
      var clients = [];
      for (var n = 1; n <= count; n++) clients.push(makeClient(ws, n, state.today, captured));
      datasetCache[key] = { workspaceId: ws, capturedAt: captured, clients: clients };
    }
    return datasetCache[key];
  }

  /* ---------- estado inicial ---------- */

  function initialState(now) {
    return {
      today: localISO(now || new Date()),
      view: 'hoy',
      scenario: 'empty',
      lastDataScenario: 'sample',
      workspaceId: 'a',
      selectedId: null,
      prepared: {},
      drafts: {},
      internal: { a: [], b: [] },
      panel: null,
      panelError: null,
      pendingReset: null,
      pending: {},
      commercialTab: 'seguimiento',
      filesMode: 'list',
      filesQuery: '',
      queueQuery: '',
      queueLimit: 60,
      queueOpen: false,
      todayQuery: '',
      todayFilter: 'all',
      todayLimit: 40,
      openFields: { reunion: false, documento: false },
      notice: null,
      noticeSeq: 0,
      seq: 0
    };
  }

  /* ---------- selectores ---------- */

  function dataAvailable(state) { return DATA_SCENARIOS.indexOf(state.scenario) !== -1; }

  function manualClient() {
    return { id: MANUAL_ID, name: null, company: null, email: null, access: 'edit', originActive: true, manual: true, opportunities: [], tasks: [], activity: [] };
  }

  function clientById(state, id) {
    if (!id) return null;
    if (id === MANUAL_ID) return manualClient();
    var list = datasetFor(state).clients;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function selectedClient(state) { return clientById(state, state.selectedId); }

  function clientLabel(c) {
    if (!c) return '';
    if (c.manual) return 'Borrador sin cliente';
    return c.name || 'Sin nombre registrado';
  }

  function accessOf(state, c) { return state.scenario === 'readonly' ? 'read' : c.access; }

  function capturedAt(state) {
    return state.scenario === 'stale' ? addDays(state.today, -STALE_DAYS) : datasetFor(state).capturedAt;
  }

  function provenance(state) {
    switch (state.scenario) {
      case 'empty': return { origin: 'Sin origen cargado', captured: null, text: 'Sin captura disponible' };
      case 'loading': return { origin: 'Origen en carga (simulado)', captured: null, text: 'Captura pendiente' };
      case 'error': return { origin: 'Error de carga (simulado)', captured: null, text: 'Captura no disponible' };
      case 'readonly': return { origin: 'Muestra del prototipo · solo lectura', captured: capturedAt(state), text: 'Captura del ' + fmtDate(capturedAt(state)) };
      case 'stale': return { origin: 'Muestra desactualizada', captured: capturedAt(state), text: 'Captura del ' + fmtDate(capturedAt(state)) };
      default: return { origin: 'Muestra del prototipo', captured: capturedAt(state), text: 'Captura del ' + fmtDate(capturedAt(state)) };
    }
  }

  function internalFor(state) { return state.internal[state.workspaceId] || []; }

  function pendingInternal(state, clientId) {
    return internalFor(state).filter(function (a) { return a.clientId === clientId && !a.done; });
  }

  function isBusy(state) { return Object.keys(state.pending).length > 0 || state.scenario === 'loading'; }

  /** Causas por las que «Preparar seguimiento» no está disponible. Lista vacía = disponible. */
  function prepareBlockers(state, c) {
    var out = [];
    if (isBusy(state)) out.push({ code: 'busy', text: 'Hay una operación en curso; espera a que termine.' });
    if (accessOf(state, c) === 'read') out.push({ code: 'readonly', text: 'El origen es de solo lectura: el seguimiento no podría aplicarse en él.' });
    if (!c.originActive) out.push({ code: 'inactive', text: 'El origen de este cliente no está activo.' });
    if (!c.email) out.push({ code: 'noemail', text: 'Falta el correo del cliente. Puedes abrir un borrador sin cliente e indicar el destinatario.' });
    return out;
  }

  function clientFlags(state, c) {
    var f = [];
    if (!c.email) f.push('Sin correo');
    if (accessOf(state, c) === 'read') f.push('Solo lectura');
    if (!c.originActive) f.push('Origen no activo');
    if (!c.opportunities.length) f.push('Sin oportunidad');
    return f;
  }

  function nextAction(state, c) {
    var all = [];
    c.tasks.forEach(function (t) {
      if (t.status === 'pending') all.push({ title: t.title, due: t.due, origin: 'Tarea CRM de muestra' });
    });
    pendingInternal(state, c.id).forEach(function (a) {
      all.push({ title: a.title, due: a.due, origin: 'Acción interna (solo este prototipo)' });
    });
    all.sort(function (x, y) {
      if (x.due && y.due) return x.due < y.due ? -1 : x.due > y.due ? 1 : 0;
      if (x.due) return -1;
      if (y.due) return 1;
      return 0;
    });
    return all[0] || null;
  }

  function todayItems(state) {
    if (!dataAvailable(state)) return [];
    var items = [];
    datasetFor(state).clients.forEach(function (c) {
      var base = clientFlags(state, c);
      var any = false;
      c.tasks.forEach(function (t) {
        if (t.status !== 'pending') return;
        any = true;
        var flags = base.slice();
        if (t.due && t.due < state.today) flags.unshift('Vencida');
        items.push({ key: t.id, clientId: c.id, kind: 'task', title: t.title, reason: t.reason, origin: 'Tarea CRM de muestra', due: t.due, flags: flags });
      });
      pendingInternal(state, c.id).forEach(function (a) {
        any = true;
        var flags = base.slice();
        if (a.due && a.due < state.today) flags.unshift('Vencida');
        items.push({ key: a.id, clientId: c.id, kind: 'internal', title: a.title, reason: 'Acción interna creada en este prototipo', origin: 'Acción interna (solo este prototipo)', due: a.due, flags: flags });
      });
      if (!any) {
        items.push({ key: c.id + '-none', clientId: c.id, kind: 'none', title: 'Sin próxima acción', reason: 'No hay tarea CRM ni acción interna pendiente en la captura', origin: 'Captura de muestra', due: null, flags: base });
      }
    });
    function rank(i) { return i.kind === 'none' ? 2 : i.due ? 0 : 1; }
    return items
      .map(function (it, idx) { return { it: it, idx: idx }; })
      .sort(function (x, y) {
        var rx = rank(x.it), ry = rank(y.it);
        if (rx !== ry) return rx - ry;
        if (rx === 0 && x.it.due !== y.it.due) return x.it.due < y.it.due ? -1 : 1;
        return x.idx - y.idx;
      })
      .map(function (o) { return o.it; });
  }

  function filterTodayItems(state, items) {
    var q = norm(state.todayQuery.trim());
    return items.filter(function (it) {
      if (state.todayFilter === 'review' && !it.flags.length) return false;
      if (state.todayFilter === 'none' && it.kind !== 'none') return false;
      if (!q) return true;
      var c = clientById(state, it.clientId);
      return norm([clientLabel(c), c.company, c.email, it.title, it.reason].join(' ')).indexOf(q) !== -1;
    });
  }

  function queueClients(state) {
    if (!dataAvailable(state)) return [];
    var q = norm(state.queueQuery.trim());
    var list = datasetFor(state).clients;
    if (!q) return list;
    return list.filter(function (c) { return norm([clientLabel(c), c.company, c.email].join(' ')).indexOf(q) !== -1; });
  }

  function activityFor(state, c) {
    var out = [];
    c.tasks.forEach(function (t) {
      out.push({ kind: 'crm', origin: 'Tarea CRM de muestra', text: t.title, due: t.due, done: t.status === 'done', date: null });
    });
    internalFor(state).filter(function (a) { return a.clientId === c.id; }).forEach(function (a) {
      out.push({ kind: 'internal', origin: 'Acción interna (solo este prototipo)', text: a.title, due: a.due, done: a.done, date: a.createdAt, id: a.id });
    });
    c.activity.forEach(function (a) {
      out.push({ kind: 'kept', origin: 'Actividad conservada de la captura', text: a.text, due: null, done: false, date: a.date });
    });
    return out;
  }

  /* ---------- borradores: transiciones puras ---------- */

  function sameContent(a, b) {
    return a.to === b.to && a.subject === b.subject && a.body === b.body && a.internal === b.internal && a.internalDue === b.internalDue;
  }

  function createDraft(c) {
    var content = { to: (c && c.email) || '', subject: '', body: '', internal: false, internalDue: '' };
    return {
      initial: Object.assign({}, content), content: Object.assign({}, content), snapshot: null, savedAt: null,
      confirmed: false, reviewed: false, invalidated: false, showErrors: false, internalCreated: false
    };
  }

  function validateContent(c) {
    var errors = {};
    if (!c.to.trim()) errors.to = 'Indica un correo de destinatario.';
    else if (!EMAIL_RE.test(c.to.trim())) errors.to = 'El correo no tiene un formato válido.';
    if (!c.subject.trim()) errors.subject = 'Escribe un asunto.';
    if (!c.body.trim()) errors.body = 'Escribe el mensaje.';
    return { ok: Object.keys(errors).length === 0, errors: errors };
  }

  function isDirty(d) { return !sameContent(d.content, d.snapshot || d.initial); }
  function isSaved(d) { return !!d.snapshot && !isDirty(d); }
  function canReview(d) { return validateContent(d.content).ok && isSaved(d); }

  function reviewHint(d) {
    if (!validateContent(d.content).ok) return 'Completa un destinatario, un asunto y un mensaje válidos.';
    if (!d.snapshot) return 'Guarda el borrador local para poder revisarlo.';
    if (isDirty(d)) return 'Hay cambios sin guardar; guárdalos para poder revisar de nuevo.';
    return '';
  }

  function editDraft(d, patch) {
    var content = Object.assign({}, d.content, patch);
    if (sameContent(content, d.content)) return d;
    return Object.assign({}, d, {
      content: content,
      invalidated: d.invalidated || d.confirmed || d.reviewed,
      confirmed: false,
      reviewed: false
    });
  }

  function saveDraft(d, at) {
    var v = validateContent(d.content);
    if (!v.ok) return { draft: Object.assign({}, d, { showErrors: true }), ok: false, errors: v.errors };
    if (d.snapshot && !isDirty(d)) return { draft: d, ok: true, unchanged: true };
    return { draft: Object.assign({}, d, { snapshot: Object.assign({}, d.content), savedAt: at || null, showErrors: true }), ok: true };
  }

  function setConfirmed(d, value) {
    if (!canReview(d) || d.reviewed) return d;
    return Object.assign({}, d, { confirmed: !!value, invalidated: value ? false : d.invalidated });
  }

  function completeReview(d) {
    if (!canReview(d) || !d.confirmed || d.reviewed) return d;
    return Object.assign({}, d, { reviewed: true, invalidated: false });
  }

  /* ---------- reductor ---------- */

  function withNotice(state, kind, text) {
    return Object.assign({}, state, { notice: { kind: kind, text: text }, noticeSeq: state.noticeSeq + 1 });
  }

  function draftKey(state, id) { return state.workspaceId + ':' + id; }

  function unsavedCount(state) {
    return Object.keys(state.drafts).filter(function (k) { return isDirty(state.drafts[k]); }).length;
  }

  function clearContext(state) {
    return Object.assign({}, state, {
      selectedId: null, prepared: {}, drafts: {}, panel: null, panelError: null, queueOpen: false,
      queueQuery: '', queueLimit: 60, filesQuery: '', openFields: { reunion: false, documento: false }
    });
  }

  function scenarioNotice(next, id) {
    switch (id) {
      case 'empty': return withNotice(next, 'status', 'Escenario vacío: no hay datos cargados.');
      case 'loading': return withNotice(next, 'status', 'Escenario de carga: se están cargando los datos (simulado).');
      case 'error': return withNotice(next, 'alert', 'No se pudieron cargar los datos (error simulado). La selección válida se conserva.');
      case 'readonly': return withNotice(next, 'status', 'Escenario de solo lectura: el origen no admite escritura.');
      case 'stale': return withNotice(next, 'status', 'Escenario de origen desactualizado: la captura tiene ' + STALE_DAYS + ' días.');
      default: return withNotice(next, 'status', 'Casos de interfaz de muestra activados.');
    }
  }

  function applyScenario(state, id) {
    var next = Object.assign({}, state, { scenario: id });
    if (DATA_SCENARIOS.indexOf(id) !== -1) next.lastDataScenario = id;
    if (id === 'empty') next = clearContext(next);
    else if (id === 'loading' || id === 'error') next.panel = null;
    return scenarioNotice(next, id);
  }

  function applyWorkspace(state, id) {
    var next = clearContext(Object.assign({}, state, { workspaceId: id }));
    var ws = WORKSPACES.filter(function (w) { return w.id === id; })[0];
    return withNotice(next, 'status', 'Espacio cambiado a «' + ws.name + '». Se han limpiado la selección, el borrador y la revisión.');
  }

  function resetNeeded(state, kind, value) {
    var n = unsavedCount(state);
    if (!n) return null;
    return { kind: kind, value: value, count: n };
  }

  function listUpdate(list, id, fn) {
    return list.map(function (x) { return x.id === id ? fn(x) : x; });
  }

  function reduce(state, a) {
    var key, d, c, r;
    switch (a.type) {
      case 'view':
        if (['hoy', 'comercial', 'integraciones'].indexOf(a.view) === -1 || a.view === state.view) return state;
        return Object.assign({}, state, { view: a.view, queueOpen: false });

      case 'select':
        c = clientById(state, a.id);
        if (!c || a.id === state.selectedId && !state.queueOpen) return state;
        return Object.assign({}, state, { selectedId: a.id, queueOpen: false });

      case 'queue/toggle': return Object.assign({}, state, { queueOpen: !state.queueOpen });
      case 'queue/query': return Object.assign({}, state, { queueQuery: a.value, queueLimit: 60 });
      case 'queue/more': return Object.assign({}, state, { queueLimit: state.queueLimit + 60 });
      case 'today/query': return Object.assign({}, state, { todayQuery: a.value, todayLimit: 40 });
      case 'today/filter':
        if (['all', 'review', 'none'].indexOf(a.value) === -1) return state;
        return Object.assign({}, state, { todayFilter: a.value, todayLimit: 40 });
      case 'today/clear': return Object.assign({}, state, { todayQuery: '', todayFilter: 'all', todayLimit: 40 });
      case 'today/more': return Object.assign({}, state, { todayLimit: state.todayLimit + 40 });

      case 'tab':
        if (['seguimiento', 'archivos'].indexOf(a.tab) === -1 || a.tab === state.commercialTab) return state;
        return Object.assign({}, state, { commercialTab: a.tab });

      case 'files/mode': return Object.assign({}, state, { filesMode: a.value });
      case 'files/query': return Object.assign({}, state, { filesQuery: a.value });
      case 'fields/toggle': {
        var of = Object.assign({}, state.openFields);
        of[a.name] = !of[a.name];
        return Object.assign({}, state, { openFields: of });
      }

      case 'scenario/request':
        if (a.value === state.scenario || !SCENARIOS.some(function (s) { return s.id === a.value; })) return state;
        if (a.value === 'empty') {
          r = resetNeeded(state, 'scenario', a.value);
          if (r) return Object.assign({}, state, { pendingReset: r });
        }
        return applyScenario(state, a.value);

      case 'workspace/request':
        if (a.value === state.workspaceId || !WORKSPACES.some(function (w) { return w.id === a.value; })) return state;
        r = resetNeeded(state, 'workspace', a.value);
        if (r) return Object.assign({}, state, { pendingReset: r });
        return applyWorkspace(state, a.value);

      case 'reset/confirm':
        if (!state.pendingReset) return state;
        r = state.pendingReset;
        return r.kind === 'workspace'
          ? applyWorkspace(Object.assign({}, state, { pendingReset: null }), r.value)
          : applyScenario(Object.assign({}, state, { pendingReset: null }), r.value);
      case 'reset/cancel':
        return state.pendingReset ? Object.assign({}, state, { pendingReset: null }) : state;

      case 'manual/open': {
        key = draftKey(state, MANUAL_ID);
        var drafts = state.drafts[key] ? state.drafts : Object.assign({}, state.drafts, (function () { var o = {}; o[key] = createDraft(null); return o; })());
        var prepared = Object.assign({}, state.prepared); prepared[key] = true;
        return withNotice(Object.assign({}, state, { view: 'comercial', selectedId: MANUAL_ID, commercialTab: 'seguimiento', queueOpen: false, panel: null, prepared: prepared, drafts: drafts }),
          'status', 'Mesa de preparación abierta con un borrador sin cliente. No se ha enviado nada.');
      }

      case 'prepare': {
        c = clientById(state, a.id);
        if (!c || a.id === MANUAL_ID || !dataAvailable(state)) return state;
        var bl = prepareBlockers(state, c);
        if (bl.length) return withNotice(state, 'alert', 'No se puede preparar el seguimiento: ' + bl[0].text);
        key = draftKey(state, a.id);
        var dr = Object.assign({}, state.drafts);
        if (!dr[key]) dr[key] = createDraft(c);
        var pr = Object.assign({}, state.prepared); pr[key] = true;
        return withNotice(Object.assign({}, state, {
          view: 'comercial', selectedId: a.id, commercialTab: 'seguimiento', queueOpen: false, panel: null, panelError: null, prepared: pr, drafts: dr
        }), 'status', 'Borrador local preparado para ' + clientLabel(c) + '. No se ha enviado nada.');
      }

      case 'panel/open':
        if (!dataAvailable(state) || !clientById(state, a.id) || a.id === MANUAL_ID) return state;
        return Object.assign({}, state, { panel: { clientId: a.id, openerKey: a.openerKey || null }, panelError: null });
      case 'panel/close':
        return state.panel ? Object.assign({}, state, { panel: null, panelError: null }) : state;

      case 'draft/edit': {
        key = draftKey(state, state.selectedId);
        d = state.drafts[key];
        if (!d) return state;
        var nd = editDraft(d, a.patch);
        if (nd === d) return state;
        var ds = Object.assign({}, state.drafts); ds[key] = nd;
        return Object.assign({}, state, { drafts: ds });
      }

      case 'draft/save': {
        key = draftKey(state, state.selectedId);
        d = state.drafts[key];
        if (!d) return state;
        var res = saveDraft(d, a.at);
        var ds2 = Object.assign({}, state.drafts); ds2[key] = res.draft;
        var s2 = Object.assign({}, state, { drafts: ds2 });
        if (!res.ok) return withNotice(s2, 'alert', 'No se puede guardar el borrador: ' + res.errors[Object.keys(res.errors)[0]]);
        if (res.unchanged) return withNotice(s2, 'status', 'No hay cambios nuevos que guardar.');
        return withNotice(s2, 'status', 'Borrador guardado en la memoria del prototipo. No se ha enviado nada.');
      }

      case 'draft/confirm': {
        key = draftKey(state, state.selectedId);
        d = state.drafts[key];
        if (!d) return state;
        var cd = setConfirmed(d, a.value);
        if (cd === d) return state;
        var ds3 = Object.assign({}, state.drafts); ds3[key] = cd;
        return Object.assign({}, state, { drafts: ds3 });
      }

      case 'draft/review': {
        key = draftKey(state, state.selectedId);
        d = state.drafts[key];
        if (!d) return state;
        var rd = completeReview(d);
        if (rd === d) return state;
        var s3 = Object.assign({}, state, { seq: state.seq + 1 });
        if (rd.content.internal && !rd.internalCreated) {
          var ws = state.workspaceId;
          var list = (s3.internal[ws] || []).concat([{
            id: 'i-' + s3.seq, clientId: state.selectedId === MANUAL_ID ? null : state.selectedId,
            title: rd.content.subject.trim(), due: rd.content.internalDue || null, done: false, createdAt: a.at || null
          }]);
          var inner = Object.assign({}, s3.internal); inner[ws] = list;
          s3.internal = inner;
          rd = Object.assign({}, rd, { internalCreated: true });
        }
        var ds4 = Object.assign({}, s3.drafts); ds4[key] = rd;
        s3.drafts = ds4;
        return withNotice(s3, 'status', 'Revisión local completada; no se ha enviado nada.');
      }

      case 'internal/create': {
        c = clientById(state, a.clientId);
        var title = (a.title || '').trim();
        if (!c || a.clientId === MANUAL_ID) return state;
        if (!title) return withNotice(Object.assign({}, state, { panelError: 'Escribe un título para la acción interna.' }), 'alert', 'No se puede crear la acción: falta el título.');
        var opKey = 'create:' + state.workspaceId + ':' + a.clientId + ':' + title + ':' + (a.due || '');
        if (state.pending[opKey]) return state;
        var dup = internalFor(state).some(function (x) { return x.clientId === a.clientId && x.title === title && (x.due || '') === (a.due || '') && !x.done; });
        if (dup) return withNotice(Object.assign({}, state, { panelError: null }), 'status', 'Ya existe una acción interna pendiente igual.');
        var pend = Object.assign({}, state.pending);
        pend[opKey] = { type: 'create', id: 'i-' + (state.seq + 1), clientId: a.clientId, title: title, due: a.due || null, at: a.at || null };
        return Object.assign({}, state, { pending: pend, seq: state.seq + 1, panelError: null });
      }

      case 'internal/complete': {
        var found = internalFor(state).filter(function (x) { return x.id === a.id; })[0];
        var okey = 'complete:' + a.id;
        if (!found || found.done || state.pending[okey]) return state;
        var pend2 = Object.assign({}, state.pending);
        pend2[okey] = { type: 'complete', id: a.id };
        return Object.assign({}, state, { pending: pend2 });
      }

      case 'op/done': {
        var op = state.pending[a.opKey];
        if (!op) return state;
        var rest = Object.assign({}, state.pending); delete rest[a.opKey];
        var base = Object.assign({}, state, { pending: rest });
        var wsId = state.workspaceId;
        var inn = Object.assign({}, base.internal);
        if (op.type === 'create') {
          inn[wsId] = (inn[wsId] || []).concat([{ id: op.id, clientId: op.clientId, title: op.title, due: op.due, done: false, createdAt: op.at }]);
          base.internal = inn;
          return withNotice(base, 'status', 'Acción interna creada en la memoria del prototipo. No se ha escrito en ningún CRM.');
        }
        inn[wsId] = listUpdate(inn[wsId] || [], op.id, function (x) { return Object.assign({}, x, { done: true }); });
        base.internal = inn;
        return withNotice(base, 'status', 'Acción interna completada en la memoria del prototipo.');
      }

      default:
        return state;
    }
  }

  var core = {
    MANUAL_ID: MANUAL_ID, SCENARIOS: SCENARIOS, WORKSPACES: WORKSPACES, CAPABILITIES: CAPABILITIES, STALE_DAYS: STALE_DAYS,
    initialState: initialState, reduce: reduce, datasetFor: datasetFor,
    dataAvailable: dataAvailable, clientById: clientById, selectedClient: selectedClient, clientLabel: clientLabel,
    accessOf: accessOf, capturedAt: capturedAt, provenance: provenance, prepareBlockers: prepareBlockers, clientFlags: clientFlags,
    nextAction: nextAction, todayItems: todayItems, filterTodayItems: filterTodayItems, queueClients: queueClients,
    activityFor: activityFor, internalFor: internalFor, isBusy: isBusy, unsavedCount: unsavedCount, draftKey: draftKey,
    createDraft: createDraft, editDraft: editDraft, saveDraft: saveDraft, setConfirmed: setConfirmed, completeReview: completeReview,
    validateContent: validateContent, isDirty: isDirty, isSaved: isSaved, canReview: canReview, reviewHint: reviewHint,
    fmtDate: fmtDate, fmtTime: fmtTime, addDays: addDays, plural: plural, norm: norm
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = core;
  global.PBWorkspace = core;

  if (typeof document === 'undefined') return;

  /* =====================================================================
   * 2. INTERFAZ
   * ===================================================================== */

  var state = core.initialState(new Date());
  var announcedSeq = 0;
  var pendingFocus = null;
  var panelShown = false;
  var lastOpener = null;
  var announceTimer = null;
  var lastAnnounced = { text: '', at: 0 };

  function $(id) { return document.getElementById(id); }

  /* ---------- helpers DOM seguros (solo textContent / nodos) ---------- */

  function append(el, kids) {
    for (var i = 0; i < kids.length; i++) {
      var k = kids[i];
      if (k === null || k === undefined || k === false) continue;
      if (Array.isArray(k)) append(el, k);
      else if (k.nodeType) el.appendChild(k);
      else el.appendChild(document.createTextNode(String(k)));
    }
  }

  /* Sustituye los hijos de `el` admitiendo nodos, textos o arrays anidados. */
  function setKids(el, kids) {
    while (el.firstChild) el.removeChild(el.firstChild);
    append(el, [kids]);
  }

  function h(tag, props) {
    var el = document.createElement(tag);
    var deferred = null;
    var kids = Array.prototype.slice.call(arguments, 2);
    var p = props || {};
    Object.keys(p).forEach(function (name) {
      var v = p[name];
      if (v === null || v === undefined || v === false) return;
      if (name === 'class') el.className = v;
      else if (name === 'key') el.setAttribute('data-pbw-key', v);
      else if (name.slice(0, 2) === 'on') el.addEventListener(name.slice(2).toLowerCase(), v);
      else if (name === 'value') deferred = v;
      else if (name === 'checked' || name === 'disabled') el[name] = true;
      else el.setAttribute(name, v === true ? '' : String(v));
    });
    append(el, kids);
    if (deferred !== null) el.value = deferred;
    return el;
  }

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var ICON_PATHS = {
    close: 'M6 6l12 12M18 6L6 18',
    clear: 'M6 6l12 12M18 6L6 18',
    chevron: 'M6 9l6 6 6-6'
  };
  function icon(name) {
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '20');
    svg.setAttribute('height', '20');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    var path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', ICON_PATHS[name]);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);
    return svg;
  }

  function iconButton(name, label, onClick, key) {
    return h('button', { type: 'button', class: 'pbw-iconbtn', title: label, 'aria-label': label, onClick: onClick, key: key }, icon(name));
  }

  /* ---------- dispatch, anuncios y foco ---------- */

  function dispatch(action, opts) {
    opts = opts || {};
    var prev = state;
    state = core.reduce(state, action);
    if (state === prev) return;
    Object.keys(state.pending).forEach(function (k) {
      if (!prev.pending[k]) {
        global.setTimeout(function () { dispatch({ type: 'op/done', opKey: k }); }, 350);
      }
    });
    if (opts.focus) pendingFocus = opts.focus;
    if (opts.quiet) announceIfNew(); else render();
  }

  function announceIfNew() {
    if (state.noticeSeq === announcedSeq || !state.notice) return;
    announcedSeq = state.noticeSeq;
    var region = $(state.notice.kind === 'alert' ? 'pbw-alert' : 'pbw-status');
    var other = $(state.notice.kind === 'alert' ? 'pbw-status' : 'pbw-alert');
    var text = state.notice.text;
    var now = Date.now();
    /* Un mismo mensaje no se vuelve a anunciar si se repite en pocos segundos (pulsaciones repetidas). */
    if (text === lastAnnounced.text && now - lastAnnounced.at < 3000) return;
    lastAnnounced = { text: text, at: now };
    other.textContent = '';
    region.textContent = '';
    global.clearTimeout(announceTimer);
    announceTimer = global.setTimeout(function () { region.textContent = text; }, 40);
  }

  function cssQuote(v) { return String(v).replace(/["\\]/g, '\\$&'); }

  function findByKey(k) { return document.querySelector('[data-pbw-key="' + cssQuote(k) + '"]'); }

  function captureFocus() {
    var a = document.activeElement;
    if (!a || a === document.body || !a.getAttribute) return null;
    var k = a.getAttribute('data-pbw-key');
    if (!k) return null;
    var f = { key: k, start: null, end: null };
    try { f.start = a.selectionStart; f.end = a.selectionEnd; } catch (e) { /* tipos sin selección */ }
    return f;
  }

  function focusKey(k) {
    var el = findByKey(k);
    if (!el || el.disabled) return false;
    el.focus();
    return true;
  }

  function focusHeading() {
    var hd = document.querySelector('#pbw-main .pbw-h1');
    if (hd) hd.focus(); else $('pbw-main').focus();
  }

  function applyFocus(f) {
    if (pendingFocus) {
      var target = pendingFocus;
      pendingFocus = null;
      if (target === 'heading') { focusHeading(); return; }
      if (!focusKey(target)) focusHeading();
      return;
    }
    if (!f) return;
    var el = findByKey(f.key);
    if (!el || el.disabled) return;
    el.focus();
    if (f.start !== null && f.start !== undefined) {
      try { el.setSelectionRange(f.start, f.end); } catch (e) { /* ignorar */ }
    }
  }

  /* ---------- render principal ---------- */

  var VIEW_TITLES = { hoy: 'Hoy', comercial: 'Comercial', integraciones: 'Integraciones' };

  function render() {
    var f = captureFocus();
    renderProto();
    renderHeader();
    renderNotices();
    renderMain();
    renderPanel();
    document.title = VIEW_TITLES[state.view] + ' · Mesa de trabajo comercial (prototipo)';
    syncHash();
    applyFocus(f);
    announceIfNew();
  }

  function syncHash() {
    var want = '#' + state.view;
    if (global.location.hash === want) return;
    try { global.history.replaceState(null, '', want); } catch (e) { /* file:// restringido */ }
  }

  /* ---------- barra del prototipo ---------- */

  function renderProto() {
    var host = $('pbw-proto');
    var sc = core.SCENARIOS.filter(function (s) { return s.id === state.scenario; })[0];
    var select = h('select', { id: 'pbw-scenario', class: 'pbw-select', key: 'scenario', 'aria-describedby': 'pbw-scenario-hint', onChange: function (ev) { dispatch({ type: 'scenario/request', value: ev.target.value }, { focus: 'scenario' }); }, value: state.scenario },
      core.SCENARIOS.map(function (s) { return h('option', { value: s.id }, s.label); }));
    var toggle = state.scenario === 'empty'
      ? h('button', { type: 'button', class: 'pbw-btn pbw-btn--quiet', key: 'proto-cases', onClick: function () { dispatch({ type: 'scenario/request', value: 'sample' }, { focus: 'proto-cases' }); } }, 'Ver casos de interfaz')
      : h('button', { type: 'button', class: 'pbw-btn pbw-btn--quiet', key: 'proto-empty', onClick: function () { dispatch({ type: 'scenario/request', value: 'empty' }, { focus: 'proto-empty' }); } }, 'Volver al vacío');
    host.replaceChildren(
      h('p', { class: 'pbw-proto__label' }, 'Prototipo de interfaz · sin conexión a servicios'),
      h('div', { class: 'pbw-proto__tools' },
        h('div', { class: 'pbw-proto__field' },
          h('label', { for: 'pbw-scenario' }, 'Escenario de revisión (herramienta del prototipo)'),
          select),
        toggle),
      h('p', { class: 'pbw-proto__hint', id: 'pbw-scenario-hint' }, sc.desc)
    );
  }

  /* ---------- cabecera y navegación ---------- */

  function renderHeader() {
    var host = $('pbw-header-content');
    var pv = core.provenance(state);
    var wsSelect = h('select', { id: 'pbw-workspace', class: 'pbw-select pbw-select--title', key: 'workspace', value: state.workspaceId,
      onChange: function (ev) { dispatch({ type: 'workspace/request', value: ev.target.value }, { focus: 'workspace' }); } },
      core.WORKSPACES.map(function (w) { return h('option', { value: w.id }, w.name); }));
    host.replaceChildren(
      h('div', { class: 'pbw-header__space' },
        h('label', { for: 'pbw-workspace', class: 'pbw-header__label' }, 'Espacio de trabajo'),
        wsSelect),
      h('dl', { class: 'pbw-header__prov' },
        h('div', null, h('dt', null, 'Origen'), h('dd', null, pv.origin)),
        h('div', null, h('dt', null, 'Fecha de captura'), h('dd', null, pv.captured ? core.fmtDate(pv.captured) : 'No disponible'))));

    var nav = $('pbw-nav-list');
    nav.replaceChildren.apply(nav, ['hoy', 'comercial', 'integraciones'].map(function (v) {
      return h('li', null, h('a', { href: '#' + v, class: 'pbw-nav__link', 'aria-current': state.view === v ? 'page' : null, key: 'nav-' + v,
        onClick: function (ev) {
          ev.preventDefault();
          dispatch({ type: 'view', view: v }, { focus: 'heading' });
        } }, VIEW_TITLES[v]));
    }));
  }

  /* ---------- avisos (reinicio pendiente, banners de estado) ---------- */

  function renderNotices() {
    var host = $('pbw-notices');
    var out = [];
    if (state.pendingReset) {
      var pr = state.pendingReset;
      var what = pr.kind === 'workspace' ? 'cambiar de espacio' : 'volver al vacío';
      out.push(h('section', { class: 'pbw-banner pbw-banner--warn', 'aria-labelledby': 'pbw-reset-title' },
        h('h2', { id: 'pbw-reset-title', class: 'pbw-banner__title' }, 'Cambios sin guardar'),
        h('p', null, 'Hay ' + core.plural(pr.count, 'borrador con cambios sin guardar', 'borradores con cambios sin guardar') + '. Si decides ' + what + ', se limpiarán la selección, el borrador y la revisión; estos cambios se perderán.'),
        h('div', { class: 'pbw-actions' },
          h('button', { type: 'button', class: 'pbw-btn pbw-btn--primary', key: 'reset-cancel', onClick: function () { dispatch({ type: 'reset/cancel' }, { focus: 'heading' }); } }, 'Seguir editando'),
          h('button', { type: 'button', class: 'pbw-btn', key: 'reset-confirm', onClick: function () { dispatch({ type: 'reset/confirm' }, { focus: 'heading' }); } }, 'Descartar y ' + (pr.kind === 'workspace' ? 'cambiar de espacio' : 'volver al vacío')))));
      if (!pendingResetShown) pendingFocus = 'reset-cancel';
      pendingResetShown = true;
    } else {
      pendingResetShown = false;
    }
    if (core.dataAvailable(state)) {
      if (state.scenario === 'stale') {
        out.push(h('p', { class: 'pbw-banner pbw-banner--warn' }, 'Origen desactualizado: la captura tiene ' + core.STALE_DAYS + ' días. Lo que ves no es una consulta actual y puede haber cambiado en el origen.'));
      }
      if (state.scenario === 'readonly') {
        out.push(h('p', { class: 'pbw-banner pbw-banner--info' }, 'Acceso de solo lectura: puedes consultar el contexto, pero no preparar seguimientos sobre el origen. Las acciones internas solo afectan a la memoria de este prototipo.'));
      }
    }
    host.replaceChildren.apply(host, out);
  }
  var pendingResetShown = false;

  /* ---------- vistas ---------- */

  function renderMain() {
    var main = $('pbw-main');
    var content;
    if (state.view === 'hoy') content = buildToday();
    else if (state.view === 'comercial') content = buildCommercial();
    else content = buildIntegrations();
    main.replaceChildren(content);
    /* Vista previa, revisión y barra de guardado se rellenan tras insertar el DOM. */
    if (state.view === 'comercial') refreshDraftViews();
  }

  function box(kind, title, bodyKids, busy) {
    return h('section', { class: 'pbw-state pbw-state--' + kind, 'aria-busy': busy ? 'true' : null }, h('h2', { class: 'pbw-state__title' }, title), bodyKids);
  }

  function emptyBox(extraTitle) {
    return box('empty', extraTitle || 'No hay información cargada', [
      h('p', null, 'Este prototipo no está conectado a ningún servicio y todavía no se ha cargado ninguna captura de clientes, así que no hay trabajos, oportunidades ni actividad que mostrar. No se inventa ninguna.'),
      h('p', null, 'Qué puedes hacer: abrir la mesa de preparación para redactar un borrador sin cliente, o activar los casos de interfaz para comprobar cómo se ve la herramienta con datos de muestra.'),
      h('div', { class: 'pbw-actions' },
        h('button', { type: 'button', class: 'pbw-btn pbw-btn--primary', key: 'empty-open', onClick: function () { dispatch({ type: 'manual/open' }, { focus: 'heading' }); } }, 'Abrir mesa de preparación'),
        h('button', { type: 'button', class: 'pbw-btn', key: 'empty-cases', onClick: function () { dispatch({ type: 'scenario/request', value: 'sample' }, { focus: 'heading' }); } }, 'Ver casos de interfaz'))
    ]);
  }

  function loadingBox(what) {
    return box('loading', 'Cargando ' + what + '…', [
      h('p', null, 'Escenario de carga simulado: no se está consultando ningún servicio. La selección y los borradores existentes se conservan y volverán a mostrarse al terminar. Elige otro escenario de revisión para continuar.')
    ], true);
  }

  function errorBox(what) {
    var sel = core.selectedClient(state);
    return box('error', 'No se pudo cargar ' + what, [
      h('p', null, 'Error simulado: ningún servicio ha fallado de verdad porque el prototipo no se conecta a ninguno.'),
      sel ? h('p', null, 'Se conserva la selección «' + core.clientLabel(sel) + '». Su borrador no se muestra mientras los datos no estén disponibles.') : null,
      h('div', { class: 'pbw-actions' },
        h('button', { type: 'button', class: 'pbw-btn pbw-btn--primary', key: 'error-retry', onClick: function () { dispatch({ type: 'scenario/request', value: state.lastDataScenario }, { focus: 'heading' }); } }, 'Reintentar'))
    ]);
  }

  /* ----- Hoy ----- */

  var FILTERS = [
    { id: 'all', label: 'Todas' },
    { id: 'review', label: 'Requieren revisión' },
    { id: 'none', label: 'Sin próxima acción' }
  ];

  function buildToday() {
    var wrap = h('div', { class: 'pbw-view' }, h('h1', { class: 'pbw-h1', tabindex: '-1' }, 'Hoy'));
    if (state.scenario === 'empty') {
      wrap.appendChild(emptyBox('Todavía no hay trabajos'));
      return wrap;
    }
    if (state.scenario === 'loading') { wrap.appendChild(loadingBox('los trabajos')); return wrap; }
    if (state.scenario === 'error') { wrap.appendChild(errorBox('los trabajos')); return wrap; }

    wrap.appendChild(h('p', { class: 'pbw-lede' }, 'Próximos trabajos según la captura. Cada fila indica su motivo, su origen y la fecha solo si existe; el orden sigue la fecha de vencimiento, no una clasificación de urgencia.'));
    var search = h('input', { type: 'search', id: 'pbw-today-q', class: 'pbw-input', key: 'today-q', value: state.todayQuery, autocomplete: 'off',
      onInput: function (ev) { dispatch({ type: 'today/query', value: ev.target.value }, { quiet: true }); refreshToday(); } });
    var fieldset = h('fieldset', { class: 'pbw-seg' },
      h('legend', null, 'Filtro'),
      FILTERS.map(function (f) {
        var id = 'pbw-filter-' + f.id;
        return h('span', { class: 'pbw-seg__item' },
          h('input', { type: 'radio', name: 'pbw-today-filter', id: id, key: 'filter-' + f.id, value: f.id, checked: state.todayFilter === f.id,
            onChange: function () { dispatch({ type: 'today/filter', value: f.id }, { quiet: true }); refreshToday(); } }),
          h('label', { for: id }, f.label));
      }));
    wrap.appendChild(h('div', { class: 'pbw-toolbar' },
      h('div', { class: 'pbw-field pbw-field--grow' }, h('label', { for: 'pbw-today-q' }, 'Buscar por cliente, empresa, correo o tarea'), search),
      fieldset));
    wrap.appendChild(h('div', { id: 'pbw-today-host' }, buildTodayList()));
    return wrap;
  }

  function refreshToday() {
    var host = $('pbw-today-host');
    if (host) setKids(host, buildTodayList());
  }

  function buildTodayList() {
    var all = core.todayItems(state);
    var items = core.filterTodayItems(state, all);
    var shown = items.slice(0, state.todayLimit);
    var parts = [];
    parts.push(h('p', { class: 'pbw-count' }, items.length === all.length
      ? core.plural(all.length, 'trabajo', 'trabajos') + ' en total'
      : items.length + ' de ' + core.plural(all.length, 'trabajo', 'trabajos') + ' con el filtro actual'));
    if (!items.length) {
      parts.push(box('nomatch', 'Ningún trabajo coincide', [
        h('p', null, 'Hay ' + core.plural(all.length, 'trabajo cargado', 'trabajos cargados') + ', pero ninguno cumple la búsqueda o el filtro actuales. No es una ausencia de datos.'),
        h('div', { class: 'pbw-actions' }, h('button', { type: 'button', class: 'pbw-btn', key: 'today-clear', onClick: function () { dispatch({ type: 'today/clear' }, { focus: 'today-q' }); } }, 'Quitar búsqueda y filtro'))
      ]));
      return parts;
    }
    parts.push(h('ul', { class: 'pbw-rows' }, shown.map(buildTodayRow)));
    if (items.length > shown.length) {
      parts.push(h('div', { class: 'pbw-actions' }, h('button', { type: 'button', class: 'pbw-btn', key: 'today-more', onClick: function () { dispatch({ type: 'today/more' }, { focus: 'today-more' }); } }, 'Mostrar más (' + (items.length - shown.length) + ' restantes)')));
    }
    return parts;
  }

  function buildTodayRow(it) {
    var c = core.clientById(state, it.clientId);
    var blockers = core.prepareBlockers(state, c);
    var noteId = 'pbw-why-' + it.key;
    var action = null;
    if (it.kind !== 'none') {
      action = h('div', { class: 'pbw-row__action' },
        h('button', { type: 'button', class: 'pbw-btn pbw-btn--primary', key: 'row-prep-' + it.key, disabled: blockers.length > 0, 'aria-describedby': blockers.length ? noteId : null,
          onClick: function () { dispatch({ type: 'prepare', id: it.clientId }, { focus: 'heading' }); } }, 'Preparar seguimiento'),
        blockers.length ? h('p', { class: 'pbw-why', id: noteId }, 'No disponible: ' + blockers[0].text) : null);
    }
    return h('li', { class: 'pbw-row' },
      h('div', { class: 'pbw-row__main' },
        h('button', { type: 'button', class: 'pbw-row__open', key: 'row-open-' + it.key,
          onClick: function (ev) { dispatch({ type: 'panel/open', id: it.clientId, openerKey: ev.currentTarget.getAttribute('data-pbw-key') }); } },
          h('span', { class: 'pbw-row__client' }, core.clientLabel(c)),
          h('span', { class: 'pbw-row__title' }, it.title)),
        h('p', { class: 'pbw-row__reason' }, 'Motivo: ' + it.reason),
        h('p', { class: 'pbw-row__meta' }, 'Origen: ' + it.origin + (c.company ? ' · ' + c.company : '')),
        it.flags.length ? h('p', { class: 'pbw-row__flags' }, 'Revisar: ' + it.flags.join(' · ')) : null),
      h('p', { class: 'pbw-row__date' }, h('span', { class: 'pbw-row__datelabel' }, it.kind === 'none' ? 'Fecha' : 'Vence'), it.due ? core.fmtDate(it.due) : 'Sin fecha disponible'),
      action || h('div', { class: 'pbw-row__action' }, h('p', { class: 'pbw-why' }, 'Abre la ficha para ver el contexto guardado.')));
  }

  /* ----- Comercial ----- */

  function buildCommercial() {
    var wrap = h('div', { class: 'pbw-view' }, h('h1', { class: 'pbw-h1', tabindex: '-1' }, 'Comercial'));
    wrap.appendChild(h('div', { class: 'pbw-split' }, buildQueue(), h('div', { class: 'pbw-bench', id: 'pbw-bench' }, buildBench())));
    return wrap;
  }

  function buildQueue() {
    var sel = core.selectedClient(state);
    var summary = sel ? core.clientLabel(sel) : 'ninguno';
    var body = [];
    if (state.scenario === 'loading') body.push(h('p', { class: 'pbw-note' }, 'Cargando clientes…'));
    else if (state.scenario === 'error') body.push(h('p', { class: 'pbw-note' }, 'No se pudo cargar la cola de clientes (simulado).' + (sel ? ' Se conserva la selección «' + core.clientLabel(sel) + '».' : '')));
    else if (state.scenario === 'empty') body.push(h('p', { class: 'pbw-note' }, 'No hay clientes cargados. Puedes redactar un borrador sin cliente.'));
    else {
      body.push(h('div', { class: 'pbw-field' },
        h('label', { for: 'pbw-queue-q' }, 'Buscar cliente por nombre, empresa o correo'),
        h('input', { type: 'search', id: 'pbw-queue-q', class: 'pbw-input', key: 'queue-q', value: state.queueQuery, autocomplete: 'off',
          onInput: function (ev) { dispatch({ type: 'queue/query', value: ev.target.value }, { quiet: true }); refreshQueue(); } })));
      body.push(h('div', { id: 'pbw-queue-host' }, buildQueueList()));
    }
    body.push(h('div', { class: 'pbw-actions' },
      h('button', { type: 'button', class: 'pbw-btn' + (state.selectedId === core.MANUAL_ID ? ' pbw-btn--current' : ''), key: 'queue-manual', onClick: function () { dispatch({ type: 'manual/open' }, { focus: 'heading' }); } }, 'Borrador sin cliente')));
    return h('aside', { class: 'pbw-queue', 'aria-labelledby': 'pbw-queue-title' },
      h('div', { class: 'pbw-queue__head' },
        h('h2', { id: 'pbw-queue-title', class: 'pbw-h2' }, 'Clientes'),
        h('button', { type: 'button', class: 'pbw-queue__toggle', key: 'queue-toggle', 'aria-expanded': state.queueOpen ? 'true' : 'false', 'aria-controls': 'pbw-queue-body',
          onClick: function () { dispatch({ type: 'queue/toggle' }, { focus: 'queue-toggle' }); } },
          h('span', null, 'Cliente elegido: ' + summary),
          icon('chevron'))),
      h('div', { class: 'pbw-queue__body', id: 'pbw-queue-body', 'data-open': state.queueOpen ? 'true' : 'false' }, body));
  }

  function refreshQueue() {
    var host = $('pbw-queue-host');
    if (host) setKids(host, buildQueueList());
  }

  function buildQueueList() {
    var all = core.queueClients(state);
    var total = core.datasetFor(state).clients.length;
    var shown = all.slice(0, state.queueLimit);
    var parts = [h('p', { class: 'pbw-count' }, all.length === total ? core.plural(total, 'cliente', 'clientes') : all.length + ' de ' + core.plural(total, 'cliente', 'clientes'))];
    if (!all.length) {
      parts.push(h('p', { class: 'pbw-note' }, 'Ningún cliente coincide con «' + state.queueQuery + '». Hay ' + core.plural(total, 'cliente cargado', 'clientes cargados') + ' en este espacio.'));
      parts.push(h('div', { class: 'pbw-actions' }, h('button', { type: 'button', class: 'pbw-btn', key: 'queue-clear', onClick: function () { dispatch({ type: 'queue/query', value: '' }, { focus: 'queue-q' }); } }, 'Borrar búsqueda')));
      return parts;
    }
    parts.push(h('ul', { class: 'pbw-qlist' }, shown.map(function (c) {
      var selected = state.selectedId === c.id;
      var d = state.drafts[core.draftKey(state, c.id)];
      var na = core.nextAction(state, c);
      var meta = [];
      meta.push(na ? 'Próxima: ' + na.title + (na.due ? ' · vence ' + core.fmtDate(na.due) : '') : 'Sin próxima acción');
      if (d && core.isDirty(d)) meta.push('Borrador con cambios sin guardar');
      else if (d && d.snapshot) meta.push('Borrador guardado en memoria');
      return h('li', null, h('button', { type: 'button', class: 'pbw-qitem', key: 'q-' + c.id, 'aria-current': selected ? 'true' : null,
        onClick: function () { dispatch({ type: 'select', id: c.id }, { focus: 'q-' + c.id }); } },
        h('span', { class: 'pbw-qitem__name' }, core.clientLabel(c)),
        h('span', { class: 'pbw-qitem__sub' }, [c.company, c.email || 'Sin correo'].filter(Boolean).join(' · ')),
        h('span', { class: 'pbw-qitem__meta' }, meta.join(' · '))));
    })));
    if (all.length > shown.length) {
      parts.push(h('div', { class: 'pbw-actions' }, h('button', { type: 'button', class: 'pbw-btn', key: 'queue-more', onClick: function () { dispatch({ type: 'queue/more' }, { focus: 'queue-more' }); } }, 'Mostrar más (' + (all.length - shown.length) + ' restantes)')));
    }
    return parts;
  }

  function buildBench() {
    if (state.scenario === 'loading') return loadingBox('la mesa de trabajo');
    if (state.scenario === 'error') return errorBox('la mesa de trabajo');
    var c = core.selectedClient(state);
    if (!c) {
      if (state.scenario === 'empty') return emptyBox('La mesa de preparación está vacía');
      return box('empty', 'Elige un cliente', [
        h('p', null, 'Selecciona un cliente en la cola para ver su contexto de captura y preparar un seguimiento. La selección se comparte entre Seguimiento y Archivos.'),
        h('div', { class: 'pbw-actions' }, h('button', { type: 'button', class: 'pbw-btn', key: 'bench-manual', onClick: function () { dispatch({ type: 'manual/open' }, { focus: 'heading' }); } }, 'Abrir un borrador sin cliente'))
      ]);
    }
    var head = h('header', { class: 'pbw-bench__head' },
      h('div', null,
        h('h2', { class: 'pbw-h2', id: 'pbw-bench-title' }, core.clientLabel(c)),
        h('p', { class: 'pbw-prov' }, c.manual
          ? 'Sin procedencia CRM: el borrador no se asocia a ningún registro.'
          : 'Procedencia: ' + c.source + ' · captura del ' + core.fmtDate(core.capturedAt(state)) + '. No es una consulta actual.')),
      c.manual ? null : h('button', { type: 'button', class: 'pbw-btn', key: 'bench-ficha',
        onClick: function (ev) { dispatch({ type: 'panel/open', id: c.id, openerKey: ev.currentTarget.getAttribute('data-pbw-key') }); } }, 'Abrir ficha'));
    return [head, buildTabs(c)];
  }

  function buildTabs(c) {
    var tabs = [{ id: 'seguimiento', label: 'Seguimiento' }, { id: 'archivos', label: 'Archivos' }];
    var list = h('div', { class: 'pbw-tabs', role: 'tablist', 'aria-label': 'Secciones de la mesa de trabajo' },
      tabs.map(function (t) {
        var active = state.commercialTab === t.id;
        return h('button', { type: 'button', role: 'tab', class: 'pbw-tab', id: 'pbw-tab-' + t.id, key: 'tab-' + t.id, 'aria-selected': active ? 'true' : 'false', 'aria-controls': 'pbw-tabpanel',
          tabindex: active ? '0' : '-1',
          onClick: function () { dispatch({ type: 'tab', tab: t.id }, { focus: 'tab-' + t.id }); },
          onKeydown: function (ev) {
            var idx = tabs.findIndex(function (x) { return x.id === t.id; });
            var next = null;
            if (ev.key === 'ArrowRight') next = tabs[(idx + 1) % tabs.length];
            else if (ev.key === 'ArrowLeft') next = tabs[(idx + tabs.length - 1) % tabs.length];
            else if (ev.key === 'Home') next = tabs[0];
            else if (ev.key === 'End') next = tabs[tabs.length - 1];
            if (next) { ev.preventDefault(); dispatch({ type: 'tab', tab: next.id }, { focus: 'tab-' + next.id }); }
          } }, t.label);
      }));
    var panel = h('div', { role: 'tabpanel', id: 'pbw-tabpanel', class: 'pbw-tabpanel', 'aria-labelledby': 'pbw-tab-' + state.commercialTab, tabindex: '-1' },
      state.commercialTab === 'seguimiento' ? buildFollowup(c) : buildFiles(c));
    return [list, panel];
  }

  /* ----- Seguimiento ----- */

  function buildContext(c) {
    if (c.manual) {
      return h('section', { class: 'pbw-section', 'aria-labelledby': 'pbw-ctx-title' },
        h('h3', { class: 'pbw-h3', id: 'pbw-ctx-title' }, 'Contexto'),
        h('p', null, 'Este borrador no está asociado a ningún cliente ni oportunidad. El correo que escribas es solo el del borrador: no se afirma ninguna identidad en el CRM.'));
    }
    var na = core.nextAction(state, c);
    var access = core.accessOf(state, c) === 'read' ? 'Solo lectura' : 'Lectura y edición';
    return h('section', { class: 'pbw-section', 'aria-labelledby': 'pbw-ctx-title' },
      h('h3', { class: 'pbw-h3', id: 'pbw-ctx-title' }, 'Contexto de la captura'),
      h('dl', { class: 'pbw-dl' },
        row('Empresa', c.company || 'No disponible'),
        row('Correo en la captura', c.email || 'No disponible'),
        row('Acceso al origen', access + (c.originActive ? '' : ' · origen no activo')),
        row('Oportunidades', c.opportunities.length
          ? h('ul', { class: 'pbw-plain' }, c.opportunities.map(function (o) { return h('li', null, o.name + ' · ' + o.stage); }))
          : 'Sin oportunidades en la captura'),
        row('Próxima acción', na ? na.title + ' · ' + na.origin + (na.due ? ' · vence ' + core.fmtDate(na.due) : ' · sin fecha') : 'Sin próxima acción')));
  }

  function row(label, value) {
    return h('div', { class: 'pbw-dl__row' }, h('dt', null, label), h('dd', null, value));
  }

  function buildFollowup(c) {
    var out = [buildContext(c)];
    var key = core.draftKey(state, c.id);
    var draft = state.drafts[key];
    if (!state.prepared[key] || !draft) {
      var blockers = core.prepareBlockers(state, c);
      var noteId = 'pbw-prep-why';
      out.push(h('section', { class: 'pbw-section', 'aria-labelledby': 'pbw-prep-title' },
        h('h3', { class: 'pbw-h3', id: 'pbw-prep-title' }, 'Preparar seguimiento'),
        h('p', null, 'Prepara un borrador local de correo para este cliente. Nada saldrá de este prototipo.'),
        h('div', { class: 'pbw-actions' },
          h('button', { type: 'button', class: 'pbw-btn pbw-btn--primary', key: 'bench-prepare', disabled: blockers.length > 0, 'aria-describedby': blockers.length ? noteId : null,
            onClick: function () { dispatch({ type: 'prepare', id: c.id }, { focus: 'subject' }); } }, 'Preparar seguimiento')),
        blockers.length
          ? h('div', { id: noteId, class: 'pbw-why' }, h('p', null, 'No disponible por:'), h('ul', null, blockers.map(function (b) { return h('li', null, b.text); })))
          : null));
      return out;
    }
    out.push(h('div', { class: 'pbw-work' }, buildEditor(c, draft), h('div', { class: 'pbw-work__side' },
      h('section', { class: 'pbw-section', 'aria-labelledby': 'pbw-prev-title', id: 'pbw-preview-host' }),
      h('section', { class: 'pbw-section pbw-review', 'aria-labelledby': 'pbw-rev-title', id: 'pbw-review-host' }))));
    return out;
  }

  function currentDraft() { return state.drafts[core.draftKey(state, state.selectedId)]; }

  function fieldBlock(id, label, control, hint, err) {
    return h('div', { class: 'pbw-field' },
      h('label', { for: id }, label),
      control,
      hint ? h('p', { class: 'pbw-hint', id: id + '-hint' }, hint) : null,
      h('p', { class: 'pbw-error', id: id + '-err' }, err || ''));
  }

  function buildEditor(c, draft) {
    var content = draft.content;
    function onType(field) {
      return function (ev) {
        dispatch({ type: 'draft/edit', patch: (function () { var o = {}; o[field] = ev.target.value; return o; })() }, { quiet: true });
        refreshDraftViews();
      };
    }
    var to = h('input', { type: 'email', id: 'pbw-to', class: 'pbw-input', key: 'to', value: content.to, autocomplete: 'off', spellcheck: 'false', 'aria-describedby': 'pbw-to-hint pbw-to-err', onInput: onType('to') });
    var subject = h('input', { type: 'text', id: 'pbw-subject', class: 'pbw-input', key: 'subject', value: content.subject, autocomplete: 'off', 'aria-describedby': 'pbw-subject-err', onInput: onType('subject') });
    var body = h('textarea', { id: 'pbw-body', class: 'pbw-textarea', key: 'body', rows: '9', 'aria-describedby': 'pbw-body-err', onInput: onType('body') });
    body.value = content.body;
    var internalDue = h('input', { type: 'date', id: 'pbw-internal-due', class: 'pbw-input', key: 'internal-due', value: content.internalDue, onChange: onType('internalDue') });
    var internalCheck = h('input', { type: 'checkbox', id: 'pbw-internal', key: 'internal', checked: content.internal,
      onChange: function (ev) {
        dispatch({ type: 'draft/edit', patch: { internal: ev.target.checked } }, { quiet: true });
        refreshDraftViews();
      } });

    var capRows = core.CAPABILITIES.map(function (cap) {
      var rid = 'pbw-cap-' + cap.id;
      var open = !!state.openFields[cap.id];
      return h('li', { class: 'pbw-cap' },
        h('div', { class: 'pbw-cap__line' },
          h('input', { type: 'checkbox', role: 'switch', id: rid, disabled: true, 'aria-describedby': rid + '-why' }),
          h('label', { for: rid }, cap.label),
          cap.fields ? h('button', { type: 'button', class: 'pbw-btn pbw-btn--quiet', key: 'fields-' + cap.id, 'aria-expanded': open ? 'true' : 'false', 'aria-controls': rid + '-fields',
            onClick: function () { dispatch({ type: 'fields/toggle', name: cap.id }, { focus: 'fields-' + cap.id }); } }, open ? 'Ocultar campos' : 'Ver campos') : null),
        h('p', { class: 'pbw-why', id: rid + '-why' }, 'Desactivado: ' + cap.reason),
        cap.fields ? h('div', { id: rid + '-fields', class: 'pbw-cap__fields', hidden: !open },
          h('p', { class: 'pbw-hint' }, 'Campos de ejemplo para explorar; no se pueden editar ni producen ningún efecto.'),
          cap.fields.map(function (f) {
            var fid = rid + '-' + f.id;
            return h('div', { class: 'pbw-field' }, h('label', { for: fid }, f.label), h('input', { type: f.type || 'text', id: fid, class: 'pbw-input', disabled: true }));
          })) : null);
    });

    return h('form', { class: 'pbw-section pbw-editor', 'aria-labelledby': 'pbw-edit-title', novalidate: true, onSubmit: function (ev) { ev.preventDefault(); } },
      h('h3', { class: 'pbw-h3', id: 'pbw-edit-title' }, 'Borrador de seguimiento'),
      h('fieldset', { class: 'pbw-fieldset' },
        h('legend', null, 'Destinatario del borrador'),
        fieldBlock('pbw-to', 'Correo del destinatario', to, 'El correo es editable y pertenece solo al borrador; no confirma ninguna identidad en el CRM.')),
      fieldBlock('pbw-subject', 'Asunto', subject),
      fieldBlock('pbw-body', 'Mensaje', body),
      c.manual ? null : h('div', { class: 'pbw-field pbw-field--check' },
        internalCheck,
        h('label', { for: 'pbw-internal' }, 'Crear una acción interna de seguimiento al marcar la revisión (solo en la memoria de este prototipo)')),
      c.manual ? null : h('div', { class: 'pbw-field', id: 'pbw-internal-due-wrap', hidden: !content.internal }, h('label', { for: 'pbw-internal-due' }, 'Fecha de la acción interna (opcional)'), internalDue),
      h('div', { class: 'pbw-savebar', id: 'pbw-savebar' }),
      h('fieldset', { class: 'pbw-fieldset' },
        h('legend', null, 'Acciones externas (demostración, desactivadas)'),
        h('p', { class: 'pbw-hint' }, 'Los controles muestran qué haría una integración futura. Ninguno está activo porque este prototipo no tiene conexiones.'),
        h('ul', { class: 'pbw-plain pbw-caps' }, capRows)));
  }

  function refreshDraftViews() {
    var draft = currentDraft();
    if (!draft) return;
    var c = core.selectedClient(state);
    var v = core.validateContent(draft.content);

    ['to', 'subject', 'body'].forEach(function (f) {
      var err = $('pbw-' + f + '-err');
      var input = $('pbw-' + f);
      if (!err || !input) return;
      var msg = draft.showErrors && v.errors[f] ? v.errors[f] : '';
      err.textContent = msg;
      if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
    });
    var wrap = $('pbw-internal-due-wrap');
    if (wrap) wrap.hidden = !draft.content.internal;

    var save = $('pbw-savebar');
    if (save) {
      var dirty = core.isDirty(draft);
      var text;
      if (draft.snapshot && !dirty) text = 'Guardado en la memoria del prototipo' + (draft.savedAt ? ' a las ' + core.fmtTime(draft.savedAt) : '') + '.';
      else if (draft.snapshot) text = 'Cambios pendientes de guardar.';
      else text = 'Borrador sin guardar.';
      save.replaceChildren(
        h('button', { type: 'button', class: 'pbw-btn pbw-btn--primary', key: 'save-draft', onClick: onSaveDraft }, 'Guardar borrador local'),
        h('p', { class: 'pbw-savebar__state' }, text));
    }

    var prev = $('pbw-preview-host');
    if (prev) prev.replaceChildren.apply(prev, buildPreview(draft));
    var rev = $('pbw-review-host');
    if (rev) rev.replaceChildren.apply(rev, buildReview(c, draft));
  }

  function onSaveDraft() {
    var before = currentDraft();
    var invalid = before ? core.validateContent(before.content) : null;
    dispatch({ type: 'draft/save', at: new Date().toISOString() }, { focus: invalid && !invalid.ok ? focusKeyForError(invalid.errors) : 'save-draft' });
  }

  function focusKeyForError(errors) {
    if (errors.to) return 'to';
    if (errors.subject) return 'subject';
    return 'body';
  }

  function buildPreview(draft) {
    var c = draft.content;
    return [
      h('h3', { class: 'pbw-h3', id: 'pbw-prev-title' }, 'Vista previa del borrador'),
      h('p', { class: 'pbw-hint' }, 'Vista previa local: no se ha enviado nada.'),
      h('div', { class: 'pbw-preview' },
        h('p', { class: 'pbw-preview__line' }, h('strong', null, 'Para: '), c.to.trim() || 'Sin destinatario'),
        h('p', { class: 'pbw-preview__line' }, h('strong', null, 'Asunto: '), c.subject.trim() || 'Sin asunto'),
        h('p', { class: 'pbw-preview__body' }, c.body.trim() ? c.body : 'El mensaje aparecerá aquí.'))
    ];
  }

  function buildReview(c, draft) {
    var content = draft.content;
    var can = core.canReview(draft);
    var hint = core.reviewHint(draft);
    var internalText = content.internal
      ? 'Crear la acción interna «' + (content.subject.trim() || 'sin título') + '»' + (content.internalDue ? ' con fecha ' + core.fmtDate(content.internalDue) : ' sin fecha') + ', solo en la memoria del prototipo, al marcar la revisión.'
      : 'No se creará ninguna acción interna.';
    var nodes = [
      h('h3', { class: 'pbw-h3', id: 'pbw-rev-title' }, 'Revisión de efectos'),
      h('dl', { class: 'pbw-dl' },
        row('Destinatario', content.to.trim() || 'Sin indicar'),
        row('Alcance', 'Un mensaje de correo para un solo destinatario. Sin adjuntos, reunión, documento ni informe.'),
        row('Efectos locales', h('ul', { class: 'pbw-plain' }, h('li', null, 'Guardar el borrador en la memoria de este prototipo.'), h('li', null, internalText))),
        row('Requeriría una integración futura', h('ul', { class: 'pbw-plain' },
          core.CAPABILITIES.filter(function (x) { return x.id === 'correo'; }).map(function (x) { return h('li', null, x.effect + ' (no disponible; no se realizará).'); }),
          h('li', null, 'Registrar la actividad resultante en el CRM (no disponible; no se realizará).'))))
    ];
    if (draft.invalidated && !draft.reviewed) {
      nodes.push(h('p', { class: 'pbw-banner pbw-banner--warn' }, 'La revisión anterior se ha invalidado porque cambió el destinatario, el texto o las acciones. Revísalo de nuevo.'));
    }
    var checkId = 'pbw-confirm';
    nodes.push(h('div', { class: 'pbw-field pbw-field--check' },
      h('input', { type: 'checkbox', id: checkId, key: 'confirm', checked: draft.confirmed, disabled: !can || draft.reviewed, 'aria-describedby': hint ? 'pbw-review-why' : null,
        onChange: function (ev) { dispatch({ type: 'draft/confirm', value: ev.target.checked }, { focus: 'confirm' }); } }),
      h('label', { for: checkId }, 'He revisado el destinatario, el asunto, el mensaje y los efectos descritos')));
    nodes.push(h('div', { class: 'pbw-actions' },
      h('button', { type: 'button', class: 'pbw-btn pbw-btn--primary', key: 'mark-review', disabled: !can || !draft.confirmed || draft.reviewed, 'aria-describedby': hint ? 'pbw-review-why' : null,
        onClick: function () { dispatch({ type: 'draft/review', at: new Date().toISOString() }, { focus: 'mark-review' }); } }, 'Marcar revisión local')));
    if (hint) nodes.push(h('p', { class: 'pbw-why', id: 'pbw-review-why' }, hint));
    if (draft.reviewed) nodes.push(h('p', { class: 'pbw-result' }, 'Revisión local completada; no se ha enviado nada.'));
    return nodes;
  }

  /* ----- Archivos ----- */

  var FILE_MODES = [
    { id: 'list', label: 'Lista de muestra' },
    { id: 'empty', label: 'Sin archivos' },
    { id: 'unauthorized', label: 'Sin autorización' },
    { id: 'loading', label: 'Cargando' },
    { id: 'error', label: 'Error' }
  ];
  var SAMPLE_FILES = ['Propuesta de muestra', 'Acta de reunión de muestra', 'Condiciones de muestra', 'Presupuesto de muestra'];

  function buildFiles(c) {
    var disabledWhy = 'No hay conexión con un almacén de documentos en este prototipo.';
    var modeSet = h('fieldset', { class: 'pbw-seg' },
      h('legend', null, 'Estado de la lista (herramienta del prototipo)'),
      FILE_MODES.map(function (m) {
        var id = 'pbw-fm-' + m.id;
        return h('span', { class: 'pbw-seg__item' },
          h('input', { type: 'radio', name: 'pbw-files-mode', id: id, key: 'fm-' + m.id, value: m.id, checked: state.filesMode === m.id,
            onChange: function () { dispatch({ type: 'files/mode', value: m.id }, { focus: 'fm-' + m.id }); } }),
          h('label', { for: id }, m.label));
      }));
    return [
      h('section', { class: 'pbw-section', 'aria-labelledby': 'pbw-files-title' },
        h('h3', { class: 'pbw-h3', id: 'pbw-files-title' }, 'Archivos de ' + core.clientLabel(c)),
        h('p', null, 'Misma selección que en Seguimiento. Los archivos remotos no se pueden añadir ni abrir desde este prototipo.'),
        h('div', { class: 'pbw-actions' },
          h('button', { type: 'button', class: 'pbw-btn', disabled: true, 'aria-describedby': 'pbw-files-why' }, 'Añadir documento'),
          h('button', { type: 'button', class: 'pbw-btn', disabled: true, 'aria-describedby': 'pbw-files-why' }, 'Abrir documento remoto')),
        h('p', { class: 'pbw-why', id: 'pbw-files-why' }, 'Desactivado: ' + disabledWhy),
        modeSet,
        h('div', { class: 'pbw-field' },
          h('label', { for: 'pbw-files-q' }, 'Buscar archivo por nombre'),
          h('input', { type: 'search', id: 'pbw-files-q', class: 'pbw-input', key: 'files-q', value: state.filesQuery, autocomplete: 'off',
            onInput: function (ev) { dispatch({ type: 'files/query', value: ev.target.value }, { quiet: true }); refreshFiles(); } })),
        h('div', { id: 'pbw-files-host' }, buildFilesList(c)))
    ];
  }

  function refreshFiles() {
    var host = $('pbw-files-host');
    var c = core.selectedClient(state);
    if (host && c) setKids(host, buildFilesList(c));
  }

  function buildFilesList(c) {
    var mode = state.filesMode;
    if (mode === 'loading') return box('loading', 'Cargando archivos…', [h('p', null, 'Estado simulado: no se está consultando ningún almacén de documentos.')], true);
    if (mode === 'error') return box('error', 'No se pudieron cargar los archivos', [
      h('p', null, 'Error simulado.'),
      h('div', { class: 'pbw-actions' }, h('button', { type: 'button', class: 'pbw-btn', key: 'files-retry', onClick: function () { dispatch({ type: 'files/mode', value: 'list' }, { focus: 'files-retry' }); } }, 'Reintentar'))]);
    if (mode === 'unauthorized') return box('unauth', 'Sin autorización para ver los archivos', [
      h('p', null, 'La cuenta que usaría una integración futura no tendría permiso para consultar esta carpeta. Este prototipo no puede solicitar permisos ni abrir ningún servicio de terceros.')]);
    if (mode === 'empty' || c.manual || !core.dataAvailable(state)) return box('empty', 'Sin archivos', [
      h('p', null, c.manual ? 'Un borrador sin cliente no tiene archivos asociados.' : 'La captura no incluye archivos asociados a este cliente.')]);
    var q = core.norm(state.filesQuery.trim());
    var files = SAMPLE_FILES.filter(function (f) { return !q || core.norm(f).indexOf(q) !== -1; });
    if (!files.length) return box('nomatch', 'Sin coincidencias', [
      h('p', null, 'Ningún archivo de muestra coincide con «' + state.filesQuery + '». Hay ' + core.plural(SAMPLE_FILES.length, 'archivo', 'archivos') + ' en la lista.'),
      h('div', { class: 'pbw-actions' }, h('button', { type: 'button', class: 'pbw-btn', key: 'files-clear', onClick: function () { dispatch({ type: 'files/query', value: '' }, { focus: 'files-q' }); } }, 'Borrar búsqueda'))]);
    return h('ul', { class: 'pbw-rows' }, files.map(function (f) {
      return h('li', { class: 'pbw-row pbw-row--file' },
        h('div', { class: 'pbw-row__main' },
          h('p', { class: 'pbw-row__title' }, f),
          h('p', { class: 'pbw-row__meta' }, 'Archivo de muestra · no existe; solo ilustra la lista')),
        h('p', { class: 'pbw-why' }, 'No se puede abrir: sin conexión a un almacén de documentos.'));
    }));
  }

  /* ----- Integraciones ----- */

  var INTEGRATION_STATES = [
    ['Sin configurar', 'No hay datos de conexión guardados para esta capacidad.'],
    ['Configurada', 'Hay datos de conexión guardados, pero nadie ha concedido acceso todavía.'],
    ['Autorizada', 'Una persona concedió acceso al servicio. Todavía no hay prueba de que funcione.'],
    ['Operación verificada', 'Se completó una operación real de comprobación. Solo este estado lleva fecha de evidencia.']
  ];
  var INTEGRATION_ROWS = [
    ['Correo', 'Redactar y enviar el seguimiento desde una cuenta autorizada.'],
    ['Reunión', 'Crear eventos de calendario con los participantes.'],
    ['Documento', 'Crear y abrir archivos de la carpeta del cliente.'],
    ['Informe', 'Generar un informe asociado al cliente.'],
    ['CRM · lectura', 'Importar contactos, oportunidades y tareas.'],
    ['CRM · edición', 'Escribir cambios de vuelta en el CRM.']
  ];

  function buildIntegrations() {
    var wrap = h('div', { class: 'pbw-view' }, h('h1', { class: 'pbw-h1', tabindex: '-1' }, 'Integraciones'));
    wrap.appendChild(h('p', { class: 'pbw-lede' }, 'Estado por capacidad. En este prototipo no existe ninguna conexión: todas las capacidades figuran sin configurar y sin evidencia.'));
    wrap.appendChild(h('section', { class: 'pbw-section', 'aria-labelledby': 'pbw-int-real' },
      h('h2', { class: 'pbw-h2', id: 'pbw-int-real' }, 'Estado real en este prototipo'),
      h('ul', { class: 'pbw-rows' }, INTEGRATION_ROWS.map(function (r) {
        return h('li', { class: 'pbw-row pbw-row--int' },
          h('div', { class: 'pbw-row__main' }, h('p', { class: 'pbw-row__title' }, r[0]), h('p', { class: 'pbw-row__meta' }, r[1])),
          h('p', { class: 'pbw-row__date' }, h('span', { class: 'pbw-row__datelabel' }, 'Estado'), 'Sin configurar'),
          h('p', { class: 'pbw-why' }, 'Sin evidencia ni fecha: no se ha configurado ni probado nada.'));
      }))));
    wrap.appendChild(h('section', { class: 'pbw-section', 'aria-labelledby': 'pbw-int-states' },
      h('h2', { class: 'pbw-h2', id: 'pbw-int-states' }, 'Qué significa cada estado'),
      h('dl', { class: 'pbw-dl' }, INTEGRATION_STATES.map(function (s) { return row(s[0], s[1]); }))));
    wrap.appendChild(h('section', { class: 'pbw-section', 'aria-labelledby': 'pbw-int-perm' },
      h('h2', { class: 'pbw-h2', id: 'pbw-int-perm' }, 'Reconexión y permisos'),
      h('p', null, 'Una conexión autorizada puede dejar de funcionar si caducan o se revocan los permisos; entonces hace falta reconectar. Hasta una nueva operación verificada, el estado no debe presentarse como operativo.'),
      h('p', null, 'El acceso de lectura permite consultar datos; el de edición permite además cambiarlos. Un origen con acceso solo de lectura no admite escribir seguimientos, aunque la conexión esté autorizada.')));

    if (core.dataAvailable(state)) {
      var t = state.today;
      var ex = [
        ['Ejemplo · proveedor de correo', 'Configurada', 'Sin fecha de evidencia', 'Datos guardados; falta la autorización.'],
        ['Ejemplo · proveedor de calendario', 'Autorizada', core.fmtDate(core.addDays(t, -9)) + ' (fecha de muestra)', 'Acceso concedido; sin operación verificada.'],
        ['Ejemplo · almacén de documentos', 'Operación verificada', core.fmtDate(core.addDays(t, -3)) + ' (fecha de muestra)', 'Se creó y borró un archivo de prueba.'],
        ['Ejemplo · CRM (reconexión)', 'Autorizada', core.fmtDate(core.addDays(t, -60)) + ' (fecha de muestra)', 'Reconexión necesaria: los permisos caducaron. Lectura autorizada; edición sin autorizar.']
      ];
      wrap.appendChild(h('section', { class: 'pbw-section', 'aria-labelledby': 'pbw-int-ex' },
        h('h2', { class: 'pbw-h2', id: 'pbw-int-ex' }, 'Tarjetas de ejemplo (no son conexiones)'),
        h('p', { class: 'pbw-hint' }, 'Muestras rotuladas para revisar el diseño de cada estado. Ninguna corresponde a un servicio real.'),
        h('div', { class: 'pbw-table-wrap', tabindex: '0', role: 'region', 'aria-label': 'Tabla de ejemplos de integración, con desplazamiento' },
          h('table', { class: 'pbw-table' },
            h('caption', { class: 'pbw-sr' }, 'Ejemplos de estados de integración'),
            h('thead', null, h('tr', null, ['Capacidad', 'Estado', 'Evidencia', 'Explicación'].map(function (x) { return h('th', { scope: 'col' }, x); }))),
            h('tbody', null, ex.map(function (r) { return h('tr', null, h('th', { scope: 'row' }, r[0]), h('td', null, r[1]), h('td', null, r[2]), h('td', null, r[3])); }))))));
    }
    return wrap;
  }

  /* ----- Ficha lateral ----- */

  var FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

  function renderPanel() {
    var host = $('pbw-panel-host');
    var shell = $('pbw-shell');
    var c = state.panel ? core.clientById(state, state.panel.clientId) : null;
    if (state.panel && c && core.dataAvailable(state)) {
      lastOpener = state.panel.openerKey;
      host.hidden = false;
      host.replaceChildren(buildPanel(c));
      shell.inert = true;
      shell.setAttribute('aria-hidden', 'true');
      document.body.classList.add('pbw-lock');
      if (!panelShown) { panelShown = true; pendingFocus = 'panel-close'; }
    } else if (panelShown) {
      panelShown = false;
      host.replaceChildren();
      host.hidden = true;
      shell.inert = false;
      shell.removeAttribute('aria-hidden');
      document.body.classList.remove('pbw-lock');
      if (!pendingFocus) pendingFocus = lastOpener || 'heading';
    }
  }

  function buildPanel(c) {
    var blockers = core.prepareBlockers(state, c);
    var whyId = 'pbw-panel-why';
    var busy = core.isBusy(state);
    var fields = [
      ['Nombre', c.name || 'No disponible'],
      ['Empresa', c.company || 'No disponible'],
      ['Correo', c.email || 'No disponible'],
      ['Acceso al origen', core.accessOf(state, c) === 'read' ? 'Solo lectura' : 'Lectura y edición'],
      ['Origen', c.originActive ? 'Activo' : 'No activo']
    ];
    var activity = core.activityFor(state, c);
    var pendingKeys = Object.keys(state.pending);

    var activityList = activity.length
      ? h('ul', { class: 'pbw-rows pbw-rows--compact' }, activity.map(function (a) {
        var completeBtn = null;
        if (a.kind === 'internal' && !a.done) {
          var pk = 'complete:' + a.id;
          completeBtn = h('button', { type: 'button', class: 'pbw-btn', key: 'complete-' + a.id, disabled: !!state.pending[pk],
            onClick: function () { dispatch({ type: 'internal/complete', id: a.id }, { focus: 'complete-' + a.id }); } }, state.pending[pk] ? 'Completando…' : 'Completar');
        }
        var dateText = a.due ? 'Vence ' + core.fmtDate(a.due) : a.date && a.kind === 'kept' ? 'Fecha ' + core.fmtDate(a.date) : a.date && a.kind === 'internal' ? 'Creada en esta sesión' : 'Sin fecha de vencimiento';
        return h('li', { class: 'pbw-row' },
          h('div', { class: 'pbw-row__main' },
            h('p', { class: 'pbw-row__title' }, a.text),
            h('p', { class: 'pbw-row__meta' }, a.origin + ' · ' + dateText + (a.done ? ' · completada' : ''))),
          completeBtn ? h('div', { class: 'pbw-row__action' }, completeBtn) : null);
      }))
      : h('p', { class: 'pbw-note' }, 'No hay actividad conservada para este cliente.');

    var titleInput = h('input', { type: 'text', id: 'pbw-act-title', class: 'pbw-input', key: 'act-title', autocomplete: 'off', 'aria-describedby': state.panelError ? 'pbw-act-err' : null, 'aria-invalid': state.panelError ? 'true' : null });
    var dueInput = h('input', { type: 'date', id: 'pbw-act-due', class: 'pbw-input', key: 'act-due' });
    var creating = pendingKeys.some(function (k) { return state.pending[k].type === 'create'; });

    return h('div', { class: 'pbw-panel-layer' },
      h('div', { class: 'pbw-backdrop', onClick: function () { dispatch({ type: 'panel/close' }); } }),
      h('aside', { class: 'pbw-panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'pbw-panel-title', onKeydown: onPanelKeydown },
        h('header', { class: 'pbw-panel__head' },
          h('div', null,
            h('h2', { class: 'pbw-h2', id: 'pbw-panel-title' }, core.clientLabel(c)),
            h('p', { class: 'pbw-prov' }, 'Procedencia: ' + c.source + ' · captura del ' + core.fmtDate(core.capturedAt(state)) + '. No es una consulta actual.')),
          iconButton('close', 'Cerrar ficha', function () { dispatch({ type: 'panel/close' }); }, 'panel-close')),
        h('div', { class: 'pbw-panel__body' },
          h('section', { class: 'pbw-section', 'aria-labelledby': 'pbw-pf' },
            h('h3', { class: 'pbw-h3', id: 'pbw-pf' }, 'Campos disponibles'),
            h('dl', { class: 'pbw-dl' }, fields.map(function (f) { return row(f[0], f[1]); }))),
          h('section', { class: 'pbw-section', 'aria-labelledby': 'pbw-po' },
            h('h3', { class: 'pbw-h3', id: 'pbw-po' }, 'Oportunidades'),
            c.opportunities.length
              ? h('ul', { class: 'pbw-plain' }, c.opportunities.map(function (o) { return h('li', null, o.name + ' · ' + o.stage); }))
              : h('p', { class: 'pbw-note' }, 'Sin oportunidades en la captura.')),
          h('section', { class: 'pbw-section', 'aria-labelledby': 'pbw-pa' },
            h('h3', { class: 'pbw-h3', id: 'pbw-pa' }, 'Actividad conservada'),
            activityList),
          h('section', { class: 'pbw-section', 'aria-labelledby': 'pbw-pi' },
            h('h3', { class: 'pbw-h3', id: 'pbw-pi' }, 'Acciones internas'),
            h('p', { class: 'pbw-hint' }, 'Solo afectan a la memoria de este prototipo. No se escribe nada en ningún CRM.'),
            h('form', { class: 'pbw-inline-form', novalidate: true, onSubmit: function (ev) {
              ev.preventDefault();
              dispatch({ type: 'internal/create', clientId: c.id, title: titleInput.value, due: dueInput.value, at: new Date().toISOString() }, { focus: 'act-title' });
            } },
              h('div', { class: 'pbw-field' }, h('label', { for: 'pbw-act-title' }, 'Título de la acción'), titleInput,
                state.panelError ? h('p', { class: 'pbw-error', id: 'pbw-act-err' }, state.panelError) : null),
              h('div', { class: 'pbw-field' }, h('label', { for: 'pbw-act-due' }, 'Fecha de vencimiento (opcional)'), dueInput),
              h('button', { type: 'submit', class: 'pbw-btn', key: 'act-create', disabled: creating }, creating ? 'Creando…' : 'Crear acción interna'))),
          h('section', { class: 'pbw-section', 'aria-labelledby': 'pbw-pp' },
            h('h3', { class: 'pbw-h3', id: 'pbw-pp' }, 'Seguimiento'),
            h('div', { class: 'pbw-actions' },
              h('button', { type: 'button', class: 'pbw-btn pbw-btn--primary', key: 'panel-prepare', disabled: blockers.length > 0, 'aria-describedby': blockers.length ? whyId : null,
                onClick: function () { dispatch({ type: 'prepare', id: c.id }, { focus: 'heading' }); } }, 'Preparar seguimiento')),
            blockers.length
              ? h('div', { class: 'pbw-why', id: whyId }, h('p', null, 'No disponible por:'), h('ul', null, blockers.map(function (b) { return h('li', null, b.text); })))
              : h('p', { class: 'pbw-hint' }, busy ? '' : 'Abre la mesa de trabajo con un borrador local para este cliente.')))));
  }

  function onPanelKeydown(ev) {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      dispatch({ type: 'panel/close' });
      return;
    }
    if (ev.key !== 'Tab') return;
    var panel = ev.currentTarget;
    var nodes = Array.prototype.filter.call(panel.querySelectorAll(FOCUSABLE), function (n) { return n.offsetParent !== null || n === document.activeElement; });
    if (!nodes.length) { ev.preventDefault(); return; }
    var first = nodes[0];
    var last = nodes[nodes.length - 1];
    var active = document.activeElement;
    if (ev.shiftKey && (active === first || !panel.contains(active))) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && (active === last || !panel.contains(active))) { ev.preventDefault(); first.focus(); }
  }

  /* ---------- arranque ---------- */

  function viewFromHash() {
    var v = String(global.location.hash || '').replace('#', '');
    return VIEW_TITLES[v] ? v : null;
  }

  function init() {
    var v = viewFromHash();
    if (v) state = Object.assign({}, state, { view: v });
    $('pbw-skip').addEventListener('click', function (ev) { ev.preventDefault(); $('pbw-main').focus(); });
    global.addEventListener('hashchange', function () {
      var hv = viewFromHash();
      if (hv && hv !== state.view) dispatch({ type: 'view', view: hv }, { focus: 'heading' });
    });
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
}(typeof window !== 'undefined' ? window : globalThis));
