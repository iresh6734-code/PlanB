/*
 * CLAUDE-QA-013 · Pruebas de estado de la mesa de trabajo comercial (núcleo puro de app.js).
 *
 * Ejecutar: node --test tests/workspace-v2-state.test.mjs
 *
 * - Sin DOM, sin mocks, sin red, sin ficheros auxiliares. Fechas e identificadores deterministas.
 * - Cada test parte de un estado inicial nuevo (`fresh()`); nada se comparte entre tests salvo el módulo.
 * - Los casos marcados `todo` reproducen una contradicción entre el brief (CLAUDE-UI-010) y el núcleo.
 *   Describen el comportamiento que debería tener el núcleo; si hoy falla, node:test lo informa como TODO
 *   y NO rompe la suite. Cuando se corrija el núcleo o se decida otro contrato, quitar `todo` o reescribir
 *   la aserción. Ver coordination/reports/CLAUDE-QA-013.md.
 */
import test from "node:test";
import assert from "node:assert/strict";

const globalsBefore = new Set(Object.getOwnPropertyNames(globalThis));
await import("../design/claude/workspace-v2/app.js");
const core = globalThis.PBWorkspace;
const addedGlobals = Object.getOwnPropertyNames(globalThis).filter((name) => !globalsBefore.has(name));

/* ------------------------------------------------------------------ */
/* Ayudantes puros                                                     */
/* ------------------------------------------------------------------ */

const TODAY = "2026-10-29";
const AT = "2026-10-29T10:00:00.000Z";
const AT2 = "2026-10-29T11:30:00.000Z";
const VALID = { subject: "Seguimiento de la propuesta", body: "Hola, retomamos la propuesta que quedó pendiente." };

const fresh = () => core.initialState(new Date(2026, 9, 29, 12, 0, 0));

/** Aplica acciones en orden; una función recibe el estado actual y devuelve la acción. */
const apply = (state, ...actions) =>
  actions.reduce((s, a) => core.reduce(s, typeof a === "function" ? a(s) : a), state);

const inScenario = (scenario) => apply(fresh(), { type: "scenario/request", value: scenario });
const sample = () => inScenario("sample");
const inWorkspaceB = () => apply(sample(), { type: "workspace/request", value: "b" });
const prepared = (id = "a-01", scenario = "sample") => apply(inScenario(scenario), { type: "prepare", id });

const edit = (patch) => ({ type: "draft/edit", patch });
const save = (at = AT) => ({ type: "draft/save", at });
const confirm = (value = true) => ({ type: "draft/confirm", value });
const review = (at = AT) => ({ type: "draft/review", at });
const firstPending = (s) => Object.keys(s.pending)[0];
const done = (s) => ({ type: "op/done", opKey: firstPending(s) });

const draftOf = (state, id = "a-01") => state.drafts[core.draftKey(state, id)];
const reviewed = (extra = {}) => apply(prepared(), edit({ ...VALID, ...extra }), save(), confirm(), review());

const createInternal = (clientId, title, due = "") => ({ type: "internal/create", clientId, title, due, at: AT });
/** Crea una acción interna y resuelve la operación pendiente. */
const withInternal = (s, clientId, title, due = "") => {
  const pending = core.reduce(s, createInternal(clientId, title, due));
  return core.reduce(pending, done(pending));
};

const parts = (iso) => iso.split("-").map(Number);
const daysBetween = (from, to) => {
  const a = parts(from);
  const b = parts(to);
  return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000);
};

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

/* ------------------------------------------------------------------ */
/* 1. Carga del módulo y vacío honesto                                 */
/* ------------------------------------------------------------------ */

test("importar sin document carga solo el núcleo puro", () => {
  assert.equal(typeof document, "undefined");
  assert.equal(typeof window, "undefined");
  assert.ok(core && typeof core === "object", "globalThis.PBWorkspace debe existir");
  assert.deepEqual(addedGlobals, ["PBWorkspace"], "la carga no debe dejar otros globales");
  for (const name of ["initialState", "reduce", "datasetFor", "todayItems", "queueClients", "prepareBlockers", "validateContent"]) {
    assert.equal(typeof core[name], "function", name);
  }
  for (const name of ["render", "dispatch", "init"]) assert.equal(core[name], undefined, `${name} no pertenece al núcleo`);
});

test("estado inicial: vacío honesto, sin clientes, trabajos, fechas ni borradores", () => {
  const s = fresh();
  assert.equal(s.scenario, "empty");
  assert.equal(s.view, "hoy");
  assert.equal(s.selectedId, null);
  assert.equal(core.dataAvailable(s), false);
  assert.equal(core.selectedClient(s), null);
  assert.deepEqual(core.todayItems(s), []);
  assert.deepEqual(core.queueClients(s), []);
  assert.deepEqual(core.internalFor(s), []);
  assert.deepEqual(s.drafts, {});
  assert.equal(core.unsavedCount(s), 0);
  assert.equal(core.isBusy(s), false);

  const pv = core.provenance(s);
  assert.equal(pv.captured, null, "sin captura no hay fecha");
  assert.ok(!/\d/.test(pv.text), `el texto de procedencia no debe contener fechas: «${pv.text}»`);
  assert.ok(!/muestra/i.test(pv.origin));

  const serialized = JSON.stringify(s);
  assert.ok(!serialized.includes("example.invalid"), "el estado vacío no arrastra correos de muestra");
  assert.ok(!/Contacto de muestra/.test(serialized));
});

test("en vacío, buscar o filtrar no hace aparecer datos", () => {
  const s = apply(fresh(), { type: "queue/query", value: "contacto" }, { type: "today/query", value: "contacto" }, { type: "today/filter", value: "review" });
  assert.deepEqual(core.queueClients(s), []);
  assert.deepEqual(core.filterTodayItems(s, core.todayItems(s)), []);
});

/* ------------------------------------------------------------------ */
/* 2. Datos de muestra rotulados                                       */
/* ------------------------------------------------------------------ */

for (const workspace of ["a", "b"]) {
  test(`muestra del espacio ${workspace}: rótulos de muestra, correos example.invalid, ids únicos`, () => {
    const s = workspace === "a" ? sample() : inWorkspaceB();
    const dataset = core.datasetFor(s);
    const { clients } = dataset;
    assert.ok(clients.length >= (workspace === "a" ? 100 : 3), "el espacio debe tener datos suficientes para probar densidad");

    const ids = [];
    for (const c of clients) {
      ids.push(c.id);
      assert.ok(c.name === null || /^Contacto de muestra \d+$/.test(c.name), `nombre no rotulado: ${c.name}`);
      assert.ok(c.email === null || /^[^\s@]+@example\.invalid$/.test(c.email), `correo fuera de example.invalid: ${c.email}`);
      assert.match(c.company, /^Empresa de muestra/);
      assert.match(c.source, /muestra/i);
      for (const o of c.opportunities) { ids.push(o.id); assert.match(o.name, /muestra/i); }
      for (const t of c.tasks) { ids.push(t.id); assert.match(t.due, /^\d{4}-\d{2}-\d{2}$/); }
      for (const a of c.activity) ids.push(a.id);
      assert.notEqual(core.clientLabel(c), c.id, "el id crudo no puede ser el nombre");
      assert.ok(!core.clientLabel(c).includes(c.id));
    }
    assert.equal(new Set(ids).size, ids.length, "identificadores duplicados");
    const emails = JSON.stringify(dataset).match(/[\w.+-]+@[\w.-]+/g) ?? [];
    assert.ok(emails.length > 0);
    for (const e of emails) assert.ok(e.endsWith("@example.invalid"), `correo no reservado: ${e}`);
  });
}

test("el primer cliente de muestra del espacio A se llama «Contacto de muestra 01» y existe un cliente sin nombre", () => {
  const s = sample();
  const clients = core.datasetFor(s).clients;
  assert.equal(clients[0].name, "Contacto de muestra 01");
  const unnamed = clients.filter((c) => c.name === null);
  assert.ok(unnamed.length >= 1, "debe haber un caso sin nombre para comprobar la etiqueta de respaldo");
  for (const c of unnamed) assert.equal(core.clientLabel(c), "Sin nombre registrado");
});

/* ------------------------------------------------------------------ */
/* 3. Selección compartida entre vistas y pestañas                     */
/* ------------------------------------------------------------------ */

test("la selección es única y sobrevive a cambios de vista y de pestaña", () => {
  let s = apply(sample(), { type: "select", id: "a-07" }, { type: "view", view: "comercial" }, { type: "tab", tab: "archivos" });
  assert.equal(s.selectedId, "a-07");
  assert.equal(s.commercialTab, "archivos");

  s = apply(s, { type: "select", id: "a-09" });
  assert.equal(s.commercialTab, "archivos", "cambiar de cliente no cambia la pestaña");
  assert.equal(core.selectedClient(s).id, "a-09");

  s = apply(s, { type: "view", view: "integraciones" }, { type: "view", view: "hoy" }, { type: "view", view: "comercial" }, { type: "tab", tab: "seguimiento" });
  assert.equal(s.selectedId, "a-09");
  assert.equal(core.selectedClient(s).id, "a-09");
});

test("vistas y pestañas desconocidas se ignoran sin tocar el estado", () => {
  const s = apply(sample(), { type: "select", id: "a-07" });
  assert.equal(core.reduce(s, { type: "view", view: "admin" }), s);
  assert.equal(core.reduce(s, { type: "tab", tab: "notas" }), s);
  assert.equal(core.reduce(s, { type: "today/filter", value: "urgent" }), s, "no se inventa un filtro de urgencia");
});

test("seleccionar un cliente no crea ni altera borradores", () => {
  const s = apply(prepared("a-01"), edit({ subject: "Pendiente" }));
  const t = apply(s, { type: "select", id: "a-07" });
  assert.deepEqual(t.drafts, s.drafts);
  assert.equal(draftOf(t, "a-07"), undefined);
});

/* ------------------------------------------------------------------ */
/* 4. Borradores separados por cliente y por espacio                   */
/* ------------------------------------------------------------------ */

test("cada cliente tiene su borrador y editar nunca escribe en el de otro", () => {
  let s = apply(
    sample(),
    { type: "prepare", id: "a-01" }, edit({ subject: "Asunto uno", body: "Cuerpo uno" }),
    { type: "prepare", id: "a-07" }, edit({ subject: "Asunto siete" })
  );
  const d1 = draftOf(s, "a-01");
  const d7 = draftOf(s, "a-07");
  assert.equal(d1.content.subject, "Asunto uno");
  assert.equal(d1.content.to, "contacto-01@example.invalid");
  assert.equal(d7.content.subject, "Asunto siete");
  assert.equal(d7.content.body, "");
  assert.equal(d7.content.to, "contacto-07@example.invalid");

  s = apply(s, { type: "select", id: "a-01" }, edit({ body: "Cuerpo uno bis" }));
  assert.equal(draftOf(s, "a-07").content.body, "", "la edición no debe cruzar a otro cliente");
  assert.equal(draftOf(s, "a-01").content.body, "Cuerpo uno bis");
});

test("editar con un cliente seleccionado sin borrador no crea borrador ni toca el de otro cliente", () => {
  const s = apply(prepared("a-01"), edit({ subject: "Uno" }), { type: "select", id: "a-09" });
  assert.equal(core.reduce(s, edit({ subject: "Fuga" })), s);
  assert.equal(core.reduce(s, save()), s);
  assert.equal(core.reduce(s, confirm()), s);
  assert.equal(core.reduce(s, review()), s);
  assert.equal(draftOf(s, "a-09"), undefined);
  assert.equal(draftOf(s, "a-01").content.subject, "Uno");
});

test("sin selección, las acciones de borrador no hacen nada", () => {
  const s = sample();
  for (const a of [edit({ subject: "x" }), save(), confirm(), review()]) assert.equal(core.reduce(s, a), s, a.type);
});

test("preparar de nuevo un cliente conserva su borrador en curso", () => {
  const s = apply(prepared("a-01"), edit({ ...VALID }), save(), edit({ body: "Texto posterior" }));
  const again = core.reduce(s, { type: "prepare", id: "a-01" });
  assert.deepEqual(draftOf(again), draftOf(s));
});

test("cambiar de espacio descarta los borradores y no deja ver el contenido del espacio anterior", () => {
  const a = apply(prepared("a-01"), edit({ ...VALID }), save());
  const b = apply(a, { type: "workspace/request", value: "b" });
  assert.equal(b.workspaceId, "b");
  assert.equal(b.pendingReset, null, "un borrador guardado no pide confirmación");
  assert.equal(b.selectedId, null);
  assert.deepEqual(b.drafts, {});
  assert.notEqual(core.draftKey(a, "x"), core.draftKey(b, "x"));
  for (const c of core.queueClients(b)) assert.match(c.id, /^b-/);
  for (const i of core.todayItems(b)) assert.match(i.clientId, /^b-/);

  const bDraft = apply(b, { type: "prepare", id: "b-01" });
  assert.equal(draftOf(bDraft, "b-01").content.subject, "");
  assert.equal(draftOf(bDraft, "b-01").content.to, "contacto-b-01@example.invalid");

  const backToA = apply(bDraft, { type: "workspace/request", value: "a" });
  assert.equal(draftOf(backToA, "a-01"), undefined, "el borrador de A no reaparece");
  assert.equal(core.reduce(backToA, { type: "select", id: "b-01" }), backToA, "un id de otro espacio es desconocido");
});

/* ------------------------------------------------------------------ */
/* 5. Guardar, revisar y editar: invalidación                          */
/* ------------------------------------------------------------------ */

test("flujo completo: guardar, confirmar y revisar produce el mensaje local exacto", () => {
  const base = reviewed();
  const d = draftOf(base);
  assert.equal(d.reviewed, true);
  assert.equal(base.notice.kind, "status");
  assert.equal(base.notice.text, "Revisión local completada; no se ha enviado nada.");
});

const FIELD_EDITS = [
  ["destinatario", { to: "otra.persona@example.invalid" }],
  ["asunto", { subject: "Asunto distinto" }],
  ["mensaje", { body: "Mensaje distinto" }],
  ["acción interna", { internal: true }],
  ["fecha de la acción interna", { internalDue: "2026-11-05" }]
];

for (const [label, patch] of FIELD_EDITS) {
  test(`editar ${label} tras revisar invalida la revisión y obliga a guardar y revisar de nuevo`, () => {
    const base = reviewed();
    assert.equal(draftOf(base).reviewed, true);

    const edited = core.reduce(base, edit(patch));
    const d = draftOf(edited);
    assert.equal(d.reviewed, false);
    assert.equal(d.confirmed, false);
    assert.equal(d.invalidated, true);
    assert.equal(core.isDirty(d), true);
    assert.equal(core.canReview(d), false, "con cambios sin guardar no se puede revisar");
    assert.equal(core.reduce(edited, review(AT2)), edited, "revisar sin guardar no hace nada");
    assert.equal(core.reduce(edited, confirm()), edited, "confirmar sin guardar no hace nada");

    const savedAgain = core.reduce(edited, save(AT2));
    assert.equal(core.canReview(draftOf(savedAgain)), true);
    assert.equal(draftOf(savedAgain).reviewed, false, "guardar no devuelve la revisión");
    assert.equal(core.reduce(savedAgain, review(AT2)), savedAgain, "revisar sin confirmar no hace nada");

    const final = apply(savedAgain, confirm(), review(AT2));
    assert.equal(draftOf(final).reviewed, true);
    assert.equal(final.notice.text, "Revisión local completada; no se ha enviado nada.");
  });
}

test("editar y volver al texto guardado deja el borrador limpio pero la revisión sigue invalidada", () => {
  const base = reviewed();
  const edited = apply(base, edit({ body: VALID.body + "x" }), edit({ body: VALID.body }));
  const d = draftOf(edited);
  assert.equal(core.isDirty(d), false);
  assert.equal(d.reviewed, false);
  assert.equal(d.invalidated, true);
  assert.equal(core.reduce(edited, review(AT2)), edited, "hace falta confirmar de nuevo de forma explícita");
});

test("una edición sin cambios reales o un guardado sin cambios no invalida la revisión", () => {
  const base = reviewed();
  assert.equal(core.reduce(base, edit({ subject: VALID.subject })), base);
  assert.equal(core.reduce(base, edit({})), base);
  const resaved = core.reduce(base, save(AT2));
  assert.equal(draftOf(resaved).reviewed, true);
  assert.equal(draftOf(resaved).savedAt, AT, "guardar sin cambios no reescribe la marca de guardado");
});

test("doble clic en revisar no repite el mensaje ni la revisión", () => {
  const base = reviewed();
  assert.equal(core.reduce(base, review(AT2)), base);
  assert.equal(core.reduce(base, confirm()), base, "una revisión completada no se reconfirma");
});

test("un borrador recién preparado no es revisable ni cuenta como cambio sin guardar", () => {
  const s = prepared();
  const d = draftOf(s);
  assert.equal(core.isDirty(d), false);
  assert.equal(core.unsavedCount(s), 0);
  assert.equal(core.canReview(d), false);
  assert.ok(core.reviewHint(d).length > 0);
  assert.equal(core.reduce(s, confirm()), s);
  assert.equal(core.reduce(s, review()), s);
});

test("con contenido válido pero sin guardar no se puede confirmar ni revisar", () => {
  const s = apply(prepared(), edit({ ...VALID }));
  assert.equal(core.validateContent(draftOf(s).content).ok, true);
  assert.equal(core.canReview(draftOf(s)), false);
  assert.ok(core.reviewHint(draftOf(s)).length > 0);
  assert.equal(core.reduce(s, confirm()), s);
  assert.equal(core.reduce(s, review()), s);
});

const INVALID_CONTENT = [
  ["asunto solo con espacios", { subject: "   " }, "subject"],
  ["mensaje solo con espacios y saltos", { body: " \n\t " }, "body"],
  ["destinatario vacío", { to: "" }, "to"],
  ["destinatario sin dominio", { to: "a@b" }, "to"],
  ["destinatario con espacios internos", { to: "a b@example.invalid" }, "to"],
  ["varios destinatarios", { to: "a@example.invalid, b@example.invalid" }, "to"],
  ["destinatario con parámetros añadidos (dos arrobas)", { to: "a@example.invalid?cc=x@example.invalid" }, "to"]
];

for (const [label, patch, field] of INVALID_CONTENT) {
  test(`contenido inválido (${label}) nunca llega a quedar revisado`, () => {
    const s = apply(prepared(), edit({ ...VALID, ...patch }), save(), confirm());
    const d = draftOf(s);
    const v = core.validateContent(d.content);
    assert.equal(v.ok, false);
    assert.ok(typeof v.errors[field] === "string" && v.errors[field].length > 0, `falta error en ${field}`);
    assert.equal(core.canReview(d), false);
    assert.equal(d.confirmed, false);
    const r = core.reduce(s, review());
    assert.equal(draftOf(r).reviewed, false);
    assert.ok(!/Revisión local completada/.test(r.notice?.text ?? ""));
  });
}

test("el contenido del usuario se conserva literal (sin escapar ni reinterpretar) y los avisos no lo repiten", () => {
  const payload = "<img src=x onerror=alert(1)>";
  const body = "<script>alert(1)</script> \"><b>negrita</b> javascript:alert(1) " + "x".repeat(5000);
  const s = apply(prepared(), edit({ subject: ` ${payload} `, body, internal: true }), save(), confirm(), review());
  const d = draftOf(s);
  assert.equal(d.reviewed, true);
  assert.equal(d.content.subject, ` ${payload} `);
  assert.equal(d.content.body, body);
  const action = core.internalFor(s)[0];
  assert.equal(action.title, payload, "el título de la acción es el asunto recortado, sin transformar");
  for (const text of [s.notice.text]) assert.ok(!text.includes("<") && !text.includes("onerror"));
});

/* ------------------------------------------------------------------ */
/* 6. Cancelar o confirmar el descarte                                 */
/* ------------------------------------------------------------------ */

test("cambiar de espacio con cambios sin guardar pide confirmación y no cambia nada todavía", () => {
  const dirty = apply(prepared(), edit({ subject: "Pendiente" }));
  const asked = core.reduce(dirty, { type: "workspace/request", value: "b" });
  assert.equal(asked.workspaceId, "a");
  assert.deepEqual({ kind: asked.pendingReset.kind, value: asked.pendingReset.value, count: asked.pendingReset.count }, { kind: "workspace", value: "b", count: 1 });
  assert.equal(asked.selectedId, "a-01");
  assert.deepEqual(asked.drafts, dirty.drafts);
});

test("cancelar el descarte conserva selección, espacio y borrador sin guardar", () => {
  const dirty = apply(prepared(), edit({ subject: "Pendiente", body: "Texto" }));
  const asked = core.reduce(dirty, { type: "workspace/request", value: "b" });
  const cancelled = core.reduce(asked, { type: "reset/cancel" });
  assert.equal(cancelled.pendingReset, null);
  assert.equal(cancelled.workspaceId, "a");
  assert.equal(cancelled.selectedId, "a-01");
  assert.deepEqual(cancelled.drafts, dirty.drafts);
  assert.equal(core.unsavedCount(cancelled), 1);
  assert.equal(core.reduce(cancelled, { type: "reset/cancel" }), cancelled);
  assert.equal(core.reduce(cancelled, { type: "reset/confirm" }), cancelled, "confirmar sin petición no limpia nada");
});

test("confirmar el cambio de espacio limpia selección, borrador, revisión y ficha", () => {
  const dirty = apply(prepared(), edit({ subject: "Pendiente" }), { type: "panel/open", id: "a-01", openerKey: "k" });
  const confirmed = apply(dirty, { type: "workspace/request", value: "b" }, { type: "reset/confirm" });
  assert.equal(confirmed.workspaceId, "b");
  assert.equal(confirmed.pendingReset, null);
  assert.equal(confirmed.selectedId, null);
  assert.deepEqual(confirmed.drafts, {});
  assert.deepEqual(confirmed.prepared, {});
  assert.equal(confirmed.panel, null);
  assert.equal(core.unsavedCount(confirmed), 0);
  assert.equal(confirmed.notice.kind, "status");
});

test("volver al vacío con cambios sin guardar también pide confirmación; cancelar conserva y confirmar vacía", () => {
  const dirty = apply(prepared(), edit({ subject: "Pendiente" }));
  const asked = core.reduce(dirty, { type: "scenario/request", value: "empty" });
  assert.equal(asked.scenario, "sample");
  assert.equal(asked.pendingReset.kind, "scenario");

  const cancelled = core.reduce(asked, { type: "reset/cancel" });
  assert.equal(cancelled.scenario, "sample");
  assert.deepEqual(cancelled.drafts, dirty.drafts);

  const confirmed = core.reduce(asked, { type: "reset/confirm" });
  assert.equal(confirmed.scenario, "empty");
  assert.equal(confirmed.selectedId, null);
  assert.deepEqual(confirmed.drafts, {});
  assert.deepEqual(core.todayItems(confirmed), []);
  assert.deepEqual(core.queueClients(confirmed), []);
});

test("sin cambios pendientes, volver al vacío o cambiar de espacio no pide confirmación", () => {
  const saved = apply(prepared(), edit({ ...VALID }), save());
  assert.equal(core.reduce(saved, { type: "scenario/request", value: "empty" }).pendingReset, null);
  assert.equal(core.reduce(saved, { type: "scenario/request", value: "empty" }).scenario, "empty");
  assert.equal(core.reduce(prepared(), { type: "workspace/request", value: "b" }).workspaceId, "b");
});

test("la petición de descarte cuenta solo los borradores con cambios sin guardar", () => {
  let s = apply(prepared("a-01"), edit({ subject: "x" }));                       // sucio e inválido
  s = apply(s, { type: "prepare", id: "a-07" }, edit({ ...VALID }), save());       // limpio
  assert.equal(core.unsavedCount(s), 1);
  assert.equal(core.reduce(s, { type: "workspace/request", value: "b" }).pendingReset.count, 1);

  s = apply(s, { type: "select", id: "a-01" }, edit({ ...VALID }), save());
  assert.equal(core.unsavedCount(s), 0);
  assert.equal(core.reduce(s, { type: "workspace/request", value: "b" }).workspaceId, "b");

  s = apply(s, edit({ subject: "otro" }), { type: "select", id: "a-07" }, edit({ subject: "otro" }));
  assert.equal(core.reduce(s, { type: "workspace/request", value: "b" }).pendingReset.count, 2);
});

/* ------------------------------------------------------------------ */
/* 7. Carga y error sin cruce de contexto                              */
/* ------------------------------------------------------------------ */

for (const scenario of ["loading", "error"]) {
  test(`escenario ${scenario}: conserva selección y borrador, no muestra datos ni pide descarte`, () => {
    const s = apply(prepared(), edit({ subject: "En curso", body: "Texto" }));
    const key = core.draftKey(s, "a-01");
    const t = core.reduce(s, { type: "scenario/request", value: scenario });

    assert.equal(t.scenario, scenario);
    assert.equal(t.pendingReset, null);
    assert.equal(t.selectedId, "a-01");
    assert.equal(core.selectedClient(t).id, "a-01", "la selección válida se conserva");
    assert.deepEqual(t.drafts, s.drafts);
    assert.equal(core.dataAvailable(t), false);
    assert.deepEqual(core.todayItems(t), []);
    assert.deepEqual(core.queueClients(t), []);
    assert.equal(core.provenance(t).captured, null);
    assert.equal(core.reduce(t, { type: "prepare", id: "a-07" }), t, "no se prepara sobre datos no disponibles");
    assert.equal(core.reduce(t, { type: "panel/open", id: "a-01", openerKey: "k" }), t);

    const back = core.reduce(t, { type: "scenario/request", value: "sample" });
    assert.deepEqual(back.drafts[key], s.drafts[key]);
    assert.equal(back.selectedId, "a-01");
  });
}

test("el error se anuncia como alerta y la carga como estado; solo la carga cuenta como operación en curso", () => {
  const s = sample();
  assert.equal(core.reduce(s, { type: "scenario/request", value: "error" }).notice.kind, "alert");
  assert.equal(core.reduce(s, { type: "scenario/request", value: "loading" }).notice.kind, "status");
  assert.equal(core.isBusy(core.reduce(s, { type: "scenario/request", value: "loading" })), true);
  assert.equal(core.isBusy(core.reduce(s, { type: "scenario/request", value: "error" })), false);
});

test("reintentar tras un error vuelve al último escenario de datos y conserva el borrador", () => {
  const s = apply(prepared("a-01", "stale"), edit({ subject: "Conservar" }));
  assert.equal(s.scenario, "stale");
  const failed = core.reduce(s, { type: "scenario/request", value: "error" });
  const retried = core.reduce(failed, { type: "scenario/request", value: failed.lastDataScenario });
  assert.equal(retried.scenario, "stale");
  assert.equal(draftOf(retried).content.subject, "Conservar");
});

test("en error, cambiar de espacio con un borrador sucio sigue exigiendo confirmación", () => {
  const s = apply(prepared(), edit({ subject: "Pendiente" }), { type: "scenario/request", value: "error" });
  const asked = core.reduce(s, { type: "workspace/request", value: "b" });
  assert.equal(asked.workspaceId, "a");
  assert.equal(asked.pendingReset.count, 1);
  const confirmed = core.reduce(asked, { type: "reset/confirm" });
  assert.equal(confirmed.workspaceId, "b");
  assert.deepEqual(confirmed.drafts, {});
  assert.equal(confirmed.selectedId, null);
});

test("pedir el escenario actual o uno desconocido no cambia el estado ni repite avisos", () => {
  const s = sample();
  assert.equal(core.reduce(s, { type: "scenario/request", value: "sample" }), s);
  assert.equal(core.reduce(s, { type: "scenario/request", value: "inexistente" }), s);
  assert.equal(core.reduce(s, { type: "workspace/request", value: "a" }), s);
  assert.equal(core.reduce(s, { type: "workspace/request", value: "z" }), s);
});

test("los escenarios cubren los seis estados del brief", () => {
  assert.deepEqual(core.SCENARIOS.map((x) => x.id).sort(), ["empty", "error", "loading", "readonly", "sample", "stale"]);
  for (const sc of core.SCENARIOS) {
    assert.ok(sc.label && sc.desc, sc.id);
  }
  assert.deepEqual(core.WORKSPACES.map((w) => w.id), ["a", "b"]);
});

/* ------------------------------------------------------------------ */
/* 8. Procedencia y fechas                                             */
/* ------------------------------------------------------------------ */

test("procedencia: solo hay fecha de captura cuando hay datos, siempre en el pasado y sin confundirse con hoy", () => {
  for (const scenario of ["empty", "loading", "error"]) {
    assert.equal(core.provenance(inScenario(scenario)).captured, null, scenario);
  }
  for (const scenario of ["sample", "readonly", "stale"]) {
    const pv = core.provenance(inScenario(scenario));
    assert.match(pv.captured, /^\d{4}-\d{2}-\d{2}$/, scenario);
    assert.ok(pv.captured < TODAY, `${scenario}: la captura no puede ser de hoy ni del futuro`);
    assert.match(pv.text, /2026/);
  }
  assert.equal(daysBetween(core.provenance(inScenario("stale")).captured, TODAY), core.STALE_DAYS);
  assert.ok(core.provenance(inWorkspaceB()).captured < TODAY);
});

test("addDays, fmtDate y norm son deterministas en bordes de mes, año y bisiesto", () => {
  assert.equal(core.addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(core.addDays("2028-02-28", 1), "2028-02-29");
  assert.equal(core.addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(core.addDays("2026-10-25", 7), "2026-11-01");
  assert.equal(core.addDays(TODAY, 0), TODAY);
  assert.equal(core.fmtDate(""), "");
  assert.equal(core.fmtDate(null), "");
  assert.equal(core.fmtDate("no-es-fecha"), "no-es-fecha", "una fecha inválida no debe lanzar");
  assert.match(core.fmtDate("2026-10-29"), /2026/);
  assert.equal(core.norm("Reunión"), "reunion");
  assert.equal(core.norm(null), "");
  assert.equal(core.norm(undefined), "");
});

/* ------------------------------------------------------------------ */
/* 9. Hoy: trabajos, orden, filtros y búsqueda                         */
/* ------------------------------------------------------------------ */

test("Hoy en muestra: tarea vencida, sin correo, solo lectura y sin oportunidad; vencida solo si vence antes de hoy", () => {
  const items = core.todayItems(sample());
  const tasks = items.filter((i) => i.kind === "task");
  assert.ok(tasks.some((i) => i.flags.includes("Vencida")));
  assert.ok(tasks.some((i) => i.flags.includes("Sin correo")));
  assert.ok(tasks.some((i) => i.flags.includes("Solo lectura")));
  assert.ok(tasks.some((i) => i.flags.includes("Sin oportunidad")));
  assert.ok(items.some((i) => i.due === TODAY), "debe existir un trabajo que vence hoy para probar el borde");

  for (const i of items) {
    assert.equal(i.flags.includes("Vencida"), Boolean(i.due) && i.due < TODAY, `${i.key}: «Vencida» solo si vence antes de hoy`);
    for (const forbidden of ["urgency", "urgencia", "priority", "prioridad", "score"]) assert.ok(!(forbidden in i), `se inventa ${forbidden}`);
    assert.ok(i.title && i.reason && i.origin, `${i.key}: motivo, origen y acción deben existir`);
    assert.match(i.origin, /muestra|prototipo/i);
  }
});

test("Hoy: claves únicas, ningún cliente desaparece y el orden es fecha, sin fecha, sin próxima acción", () => {
  const s = sample();
  const items = core.todayItems(s);
  const keys = items.map((i) => i.key);
  assert.equal(new Set(keys).size, keys.length, "claves repetidas");
  assert.deepEqual(new Set(items.map((i) => i.clientId)), new Set(core.datasetFor(s).clients.map((c) => c.id)));

  const rank = (i) => (i.kind === "none" ? 2 : i.due ? 0 : 1);
  for (let n = 1; n < items.length; n++) {
    assert.ok(rank(items[n - 1]) <= rank(items[n]), `orden roto en ${items[n].key}`);
    if (rank(items[n]) === 0 && rank(items[n - 1]) === 0) assert.ok(items[n - 1].due <= items[n].due);
  }
});

test("una acción interna con fecha anterior pasa delante; sin fecha va tras las fechadas y antes de «sin próxima acción»", () => {
  const dated = withInternal(sample(), "a-07", "Llamar antes", "2020-01-01");
  assert.equal(core.todayItems(dated)[0].kind, "internal");
  assert.ok(core.todayItems(dated)[0].flags.includes("Vencida"));

  const undated = withInternal(sample(), "a-07", "Sin fecha");
  const items = core.todayItems(undated);
  const at = items.findIndex((i) => i.kind === "internal");
  assert.ok(at > 0);
  assert.ok(items.slice(0, at).every((i) => i.due), "todo lo anterior tiene fecha");
  assert.ok(items.slice(at + 1).every((i) => i.kind === "none"), "todo lo posterior es «sin próxima acción»");
  assert.ok(!items.some((i) => i.clientId === "a-07" && i.kind === "none"), "ya tiene próxima acción");
});

test("filtros de Hoy: «Sin próxima acción» y «Requieren revisión» respetan sus reglas", () => {
  const s = sample();
  const all = core.todayItems(s);
  const clients = core.datasetFor(s).clients;
  const withTask = new Set(clients.filter((c) => c.tasks.some((t) => t.status === "pending")).map((c) => c.id));

  const none = core.filterTodayItems(apply(s, { type: "today/filter", value: "none" }), all);
  assert.ok(none.length > 0);
  assert.ok(none.every((i) => i.kind === "none"));
  assert.deepEqual(none.map((i) => i.clientId).sort(), clients.filter((c) => !withTask.has(c.id)).map((c) => c.id).sort());

  const review = core.filterTodayItems(apply(s, { type: "today/filter", value: "review" }), all);
  assert.ok(review.length > 0 && review.length < all.length);
  assert.ok(review.every((i) => i.flags.length > 0));
  for (const i of all.filter((x) => x.flags.includes("Vencida"))) assert.ok(review.includes(i), `${i.key} vencida debe requerir revisión`);

  assert.equal(core.filterTodayItems(s, all).length, all.length);
});

test("búsqueda en Hoy: sin acentos ni mayúsculas, combinable con filtro, y «sin coincidencias» no es «sin datos»", () => {
  const s = sample();
  const all = core.todayItems(s);
  const accent = core.filterTodayItems(apply(s, { type: "today/query", value: "recepción" }), all);
  const plain = core.filterTodayItems(apply(s, { type: "today/query", value: "RECEPCION" }), all);
  assert.ok(accent.length > 0);
  assert.deepEqual(plain.map((i) => i.key), accent.map((i) => i.key));

  const none = core.filterTodayItems(apply(s, { type: "today/query", value: "zzzz" }), all);
  assert.equal(none.length, 0);
  assert.ok(all.length > 0, "el total cargado sigue disponible para explicar que no es ausencia de datos");

  const combined = core.filterTodayItems(apply(s, { type: "today/filter", value: "none" }, { type: "today/query", value: "contacto-07@example.invalid" }), all);
  assert.equal(combined.length, 1);
  assert.equal(combined[0].clientId, "a-07");
  assert.equal(combined[0].kind, "none");

  const cleared = apply(s, { type: "today/filter", value: "none" }, { type: "today/query", value: "zzzz" }, { type: "today/clear" });
  assert.equal(cleared.todayQuery, "");
  assert.equal(cleared.todayFilter, "all");
});

/* ------------------------------------------------------------------ */
/* 10. Cola de clientes                                                */
/* ------------------------------------------------------------------ */

test("búsqueda de clientes: coincide por nombre, empresa o correo sin acentos ni mayúsculas", () => {
  const base = sample();
  const clients = core.datasetFor(base).clients;
  const haystack = (c) => core.norm([c.name ?? "", c.company ?? "", c.email ?? ""].join(" "));
  for (const q of ["contacto-0", "MUESTRA 12", "example.invalid", "sin-nombre", " contacto-07 ", "CONTACTO DE MUESTRA 1", "zzz"]) {
    const got = new Set(core.queueClients(apply(base, { type: "queue/query", value: q })).map((c) => c.id));
    const expected = new Set(clients.filter((c) => haystack(c).includes(core.norm(q.trim()))).map((c) => c.id));
    assert.deepEqual(got, expected, `consulta «${q}»`);
  }
  assert.equal(core.queueClients(base).length, clients.length);
});

test("el cliente sin nombre no inventa nombre ni se encuentra con un nombre de muestra", () => {
  const s = apply(sample(), { type: "queue/query", value: "Contacto de muestra 05" });
  assert.ok(!core.queueClients(s).some((c) => c.id === "a-05"));
  const c = core.clientById(s, "a-05");
  assert.equal(c.name, null);
  assert.ok(!core.clientLabel(c).includes("05") && !core.clientLabel(c).includes("a-05"));
  const draft = draftOf(apply(s, { type: "prepare", id: "a-05" }), "a-05");
  assert.equal(draft.content.to, "sin-nombre-05@example.invalid", "el destinatario sale del correo, no de un nombre inventado");
});

test("filtrar la cola no deselecciona al cliente elegido", () => {
  const s = apply(sample(), { type: "select", id: "a-03" }, { type: "queue/query", value: "zzzz" });
  assert.deepEqual(core.queueClients(s), []);
  assert.equal(s.selectedId, "a-03");
  assert.equal(core.selectedClient(s).id, "a-03");
});

test("cambiar la búsqueda de la cola reinicia la paginación", () => {
  const more = apply(sample(), { type: "queue/more" });
  assert.ok(more.queueLimit > fresh().queueLimit);
  assert.equal(core.reduce(more, { type: "queue/query", value: "a" }).queueLimit, fresh().queueLimit);
});

/* ------------------------------------------------------------------ */
/* 11. Preparar seguimiento: causas de bloqueo                         */
/* ------------------------------------------------------------------ */

const BLOCKED = [
  ["a-04", "readonly", "acceso de solo lectura"],
  ["a-02", "noemail", "sin correo"],
  ["a-06", "inactive", "origen inactivo"]
];

for (const [id, code, label] of BLOCKED) {
  test(`${id} (${label}) no permite preparar: explica la causa y no crea borrador, selección ni cambio de vista`, () => {
    const s = sample();
    const blockers = core.prepareBlockers(s, core.clientById(s, id));
    assert.ok(blockers.some((b) => b.code === code));
    assert.ok(blockers.every((b) => b.text.length > 0));

    const t = core.reduce(s, { type: "prepare", id });
    assert.equal(t.notice.kind, "alert");
    assert.deepEqual(t.drafts, {});
    assert.deepEqual(t.prepared, {});
    assert.equal(t.selectedId, null);
    assert.equal(t.view, "hoy");
  });
}

test("un cliente sin causas se puede preparar: cambia a Comercial/Seguimiento y no afirma envío", () => {
  const s = apply(sample(), { type: "tab", tab: "archivos" }, { type: "prepare", id: "a-01" });
  assert.deepEqual(core.prepareBlockers(sample(), core.clientById(s, "a-01")), []);
  assert.equal(s.view, "comercial");
  assert.equal(s.commercialTab, "seguimiento");
  assert.equal(s.selectedId, "a-01");
  assert.equal(s.notice.kind, "status");
  assert.match(s.notice.text, /no se ha enviado nada/i);
});

test("solo lectura: todos los clientes quedan bloqueados, también en el escenario completo", () => {
  const s = inScenario("readonly");
  assert.ok(s.scenario === "readonly");
  for (const id of ["a-01", "a-07", "a-09"]) {
    assert.ok(core.prepareBlockers(s, core.clientById(s, id)).some((b) => b.code === "readonly"), id);
    assert.equal(core.reduce(s, { type: "prepare", id }).selectedId, null, id);
  }
  assert.ok(core.todayItems(s).every((i) => i.flags.includes("Solo lectura")));
});

test("origen desactualizado no figura entre las causas de bloqueo del brief: se puede preparar", () => {
  const s = inScenario("stale");
  assert.deepEqual(core.prepareBlockers(s, core.clientById(s, "a-01")), []);
  assert.equal(core.reduce(s, { type: "prepare", id: "a-01" }).selectedId, "a-01");
});

test("varias causas a la vez se listan todas con código y texto", () => {
  const s = inScenario("readonly");
  const codes = (id) => core.prepareBlockers(s, core.clientById(s, id)).map((b) => b.code).sort();
  assert.deepEqual(codes("a-02"), ["noemail", "readonly"]);
  assert.deepEqual(codes("a-06"), ["inactive", "readonly"]);
  const pending = core.reduce(s, createInternal("a-04", "Nota"));
  assert.deepEqual(core.prepareBlockers(pending, core.clientById(pending, "a-04")).map((b) => b.code).sort(), ["busy", "readonly"]);
});

test("una operación interna en curso bloquea preparar hasta que termine", () => {
  const pending = core.reduce(sample(), createInternal("a-07", "Llamar"));
  assert.equal(core.isBusy(pending), true);
  assert.ok(core.prepareBlockers(pending, core.clientById(pending, "a-01")).some((b) => b.code === "busy"));
  const blocked = core.reduce(pending, { type: "prepare", id: "a-01" });
  assert.equal(blocked.notice.kind, "alert");
  assert.deepEqual(blocked.drafts, {});
  assert.equal(blocked.view, "hoy");

  const finished = core.reduce(pending, done(pending));
  assert.equal(core.isBusy(finished), false);
  assert.equal(core.reduce(finished, { type: "prepare", id: "a-01" }).selectedId, "a-01");
});

/* ------------------------------------------------------------------ */
/* 12. Identificadores desconocidos                                    */
/* ------------------------------------------------------------------ */

test("un id desconocido, vacío, de otro espacio o con otro formato no crea identidad, borrador ni acción", () => {
  const s = sample();
  const unknown = ["zz-99", "", null, undefined, "a-1", "A-01", "a-241", "b-01", " a-01"];
  for (const id of unknown) {
    for (const action of [
      { type: "select", id },
      { type: "prepare", id },
      { type: "panel/open", id, openerKey: "k" },
      createInternal(id, "Llamar")
    ]) {
      assert.equal(core.reduce(s, action), s, `${action.type} con id ${JSON.stringify(id)} debe ser inerte`);
    }
  }
  assert.equal(core.clientById(s, "zz-99"), null);
  assert.equal(core.reduce(s, { type: "accion-inexistente" }), s);
  assert.equal(core.reduce(s, {}), s);
});

test("el identificador reservado del borrador sin cliente no se acepta en preparar, ficha ni acciones internas", () => {
  const s = sample();
  assert.equal(core.reduce(s, { type: "prepare", id: core.MANUAL_ID }), s);
  assert.equal(core.reduce(s, { type: "panel/open", id: core.MANUAL_ID, openerKey: "k" }), s);
  assert.equal(core.reduce(s, createInternal(core.MANUAL_ID, "Llamar")), s);
});

/* ------------------------------------------------------------------ */
/* 13. Acciones internas: sin duplicados                               */
/* ------------------------------------------------------------------ */

test("doble envío de una acción interna: una sola operación, una sola acción", () => {
  const s = sample();
  const first = core.reduce(s, createInternal("a-07", "Llamar para cerrar fecha", "2026-11-03"));
  const keys = Object.keys(first.pending);
  assert.equal(keys.length, 1);
  assert.equal(core.internalFor(first).length, 0, "no se aplica hasta que termina la operación");

  assert.equal(core.reduce(first, createInternal("a-07", "Llamar para cerrar fecha", "2026-11-03")), first, "doble clic");
  assert.equal(core.reduce(first, createInternal("a-07", "  Llamar para cerrar fecha  ", "2026-11-03")), first, "mismo título con espacios");

  const applied = core.reduce(first, { type: "op/done", opKey: keys[0] });
  assert.equal(core.internalFor(applied).length, 1);
  const action = core.internalFor(applied)[0];
  assert.equal(typeof action.id, "string");
  assert.equal(action.clientId, "a-07");
  assert.equal(action.title, "Llamar para cerrar fecha");
  assert.equal(action.due, "2026-11-03");
  assert.equal(action.done, false);
  assert.equal(applied.notice.kind, "status");
  assert.match(applied.notice.text, /memoria/i);
  assert.ok(!/hubspot/i.test(applied.notice.text));

  assert.equal(core.reduce(applied, { type: "op/done", opKey: keys[0] }), applied, "un temporizador repetido no duplica");

  const again = core.reduce(applied, createInternal("a-07", "Llamar para cerrar fecha", "2026-11-03"));
  assert.equal(core.internalFor(again).length, 1, "una igual pendiente no se duplica tras terminar");
  assert.equal(Object.keys(again.pending).length, 0);
});

test("acciones internas distintas no se bloquean entre sí", () => {
  const s = apply(sample(), createInternal("a-07", "Primera"), createInternal("a-07", "Segunda"), createInternal("a-07", "Primera", "2026-11-03"));
  assert.equal(Object.keys(s.pending).length, 3);
  const finished = apply(s, done, done, done);
  assert.equal(core.internalFor(finished).length, 3);
  const ids = core.internalFor(finished).map((a) => a.id);
  assert.equal(new Set(ids).size, 3);
});

test("completar una acción interna: doble clic, repetición y completada no duplican; sale de Hoy y vuelve a «sin próxima acción»", () => {
  const created = withInternal(sample(), "a-07", "Revisar presupuesto");
  const id = core.internalFor(created)[0].id;
  assert.ok(core.todayItems(created).some((i) => i.kind === "internal" && i.clientId === "a-07"));

  const pending = core.reduce(created, { type: "internal/complete", id });
  assert.equal(Object.keys(pending.pending).length, 1);
  assert.equal(core.reduce(pending, { type: "internal/complete", id }), pending, "doble clic");
  assert.equal(core.internalFor(pending)[0].done, false, "no está completada hasta terminar la operación");

  const completed = core.reduce(pending, done(pending));
  assert.equal(core.internalFor(completed).length, 1);
  assert.equal(core.internalFor(completed)[0].done, true);
  assert.equal(completed.notice.kind, "status");
  assert.equal(core.reduce(completed, { type: "internal/complete", id }), completed);
  assert.equal(core.reduce(created, { type: "internal/complete", id: "i-999" }), created);

  assert.equal(core.nextAction(completed, core.clientById(completed, "a-07")), null);
  const items = core.todayItems(completed).filter((i) => i.clientId === "a-07");
  assert.deepEqual(items.map((i) => i.kind), ["none"]);
});

test("crear una acción sin título avisa con alerta y no deja operaciones; un título válido limpia el error", () => {
  const empty = core.reduce(sample(), createInternal("a-07", "   "));
  assert.equal(empty.notice.kind, "alert");
  assert.equal(typeof empty.panelError, "string");
  assert.ok(empty.panelError.length > 0);
  assert.deepEqual(empty.pending, {});
  assert.equal(core.internalFor(empty).length, 0);

  const ok = core.reduce(empty, createInternal("a-07", "Llamar"));
  assert.equal(ok.panelError, null);
});

test("las acciones internas se pueden crear en solo lectura (solo afectan a la memoria del prototipo)", () => {
  const s = withInternal(inScenario("readonly"), "a-04", "Registrar una nota");
  assert.equal(core.internalFor(s).length, 1);
  assert.equal(core.internalFor(s)[0].clientId, "a-04");
});

test("próxima acción: gana la fecha más próxima y una acción sin fecha no adelanta a una fechada", () => {
  const s = sample();
  const task = core.clientById(s, "a-01").tasks[0];
  const earlier = withInternal(s, "a-01", "Antes", core.addDays(task.due, -2));
  assert.equal(core.nextAction(earlier, core.clientById(earlier, "a-01")).title, "Antes");
  const later = withInternal(s, "a-01", "Después", core.addDays(task.due, 5));
  assert.equal(core.nextAction(later, core.clientById(later, "a-01")).title, task.title);
  const undated = withInternal(s, "a-01", "Sin fecha");
  assert.equal(core.nextAction(undated, core.clientById(undated, "a-01")).title, task.title);
});

test("la actividad distingue origen (tarea CRM, acción interna, actividad conservada) y conserva los vencimientos", () => {
  const s = reviewed({ internal: true, internalDue: "2026-11-05" });
  const c = core.clientById(s, "a-01");
  const activity = core.activityFor(s, c);
  const byKind = Object.fromEntries(activity.map((a) => [a.kind, a]));
  assert.deepEqual([...new Set(activity.map((a) => a.kind))].sort(), ["crm", "internal", "kept"]);
  assert.equal(new Set(activity.map((a) => a.origin)).size, 3, "cada tipo declara un origen propio");
  assert.equal(byKind.crm.due, c.tasks[0].due);
  assert.equal(byKind.internal.due, "2026-11-05");
  assert.match(byKind.internal.origin, /prototipo/i);
  assert.ok(activity.every((a) => a.text));
});

test("revisar con acción interna crea una sola acción aunque se repita el flujo y aparece en Hoy", () => {
  const base = reviewed({ internal: true, internalDue: "2026-11-05" });
  assert.equal(core.internalFor(base).length, 1);
  assert.equal(core.reduce(base, review(AT2)), base);

  const again = apply(base, edit({ body: VALID.body + " Gracias." }), save(AT2), confirm(), review(AT2));
  assert.equal(draftOf(again).reviewed, true);
  assert.equal(core.internalFor(again).length, 1, "no se duplica al volver a revisar");

  const action = core.internalFor(again)[0];
  assert.equal(action.clientId, "a-01");
  assert.equal(action.title, VALID.subject);
  assert.equal(action.done, false);
  const item = core.todayItems(again).find((i) => i.kind === "internal");
  assert.equal(item.title, VALID.subject);
  assert.match(item.origin, /prototipo/i);
});

test("los ids de acciones internas son únicos aunque se mezclen creación directa y revisión", () => {
  const s = apply(prepared(), edit({ ...VALID, internal: true }), save(), confirm(), createInternal("a-07", "Directa"), review(), done);
  const ids = core.internalFor(s).map((a) => a.id);
  assert.equal(ids.length, 2);
  assert.equal(new Set(ids).size, 2);
});

/* ------------------------------------------------------------------ */
/* 14. Borrador sin cliente (entrada desde el vacío)                   */
/* ------------------------------------------------------------------ */

test("desde el vacío se abre un borrador sin cliente sin inventar datos ni identidad", () => {
  const s = core.reduce(fresh(), { type: "manual/open" });
  assert.equal(s.view, "comercial");
  assert.equal(s.commercialTab, "seguimiento");
  assert.equal(s.selectedId, core.MANUAL_ID);
  assert.equal(s.scenario, "empty");
  assert.match(s.notice.text, /no se ha enviado nada/i);

  const c = core.selectedClient(s);
  assert.equal(c.name, null);
  assert.equal(core.clientLabel(c), "Borrador sin cliente");
  assert.deepEqual([c.opportunities, c.tasks, c.activity], [[], [], []]);
  assert.deepEqual(core.queueClients(s), []);
  assert.deepEqual(core.todayItems(s), []);
  assert.equal(draftOf(s, core.MANUAL_ID).content.to, "", "el destinatario no se rellena con ningún dato");
  assert.equal(core.provenance(s).captured, null);
});

test("el borrador sin cliente se puede guardar y revisar sin crear acciones ni afirmar envío", () => {
  const s = apply(
    core.reduce(fresh(), { type: "manual/open" }),
    edit({ to: "persona@example.invalid", ...VALID }), save(), confirm(), review()
  );
  assert.equal(draftOf(s, core.MANUAL_ID).reviewed, true);
  assert.equal(s.notice.text, "Revisión local completada; no se ha enviado nada.");
  assert.deepEqual(core.internalFor(s), []);
});

test("reabrir el borrador sin cliente conserva lo escrito y un borrador sucio cuenta para el aviso de descarte", () => {
  let s = apply(core.reduce(fresh(), { type: "manual/open" }), edit({ to: "persona@example.invalid", subject: "Tema" }));
  s = apply(s, { type: "scenario/request", value: "sample" }, { type: "select", id: "a-01" }, { type: "manual/open" });
  assert.equal(draftOf(s, core.MANUAL_ID).content.subject, "Tema");
  assert.equal(core.unsavedCount(s), 1);
  assert.equal(core.reduce(s, { type: "workspace/request", value: "b" }).pendingReset.count, 1);
});

/* ------------------------------------------------------------------ */
/* 15. Ficha lateral (estado)                                          */
/* ------------------------------------------------------------------ */

test("la ficha solo se abre con datos disponibles y un cliente real, y guarda el disparador", () => {
  assert.equal(core.reduce(fresh(), { type: "panel/open", id: "a-01", openerKey: "k" }).panel, null);
  const open = core.reduce(sample(), { type: "panel/open", id: "a-01", openerKey: "row-open-a-01-t1" });
  assert.deepEqual(open.panel, { clientId: "a-01", openerKey: "row-open-a-01-t1" });
  assert.equal(core.reduce(open, { type: "panel/close" }).panel, null);
  assert.equal(core.reduce(sample(), { type: "panel/close" }).panel === null, true);
});

test("abrir la ficha desde una tarea no cambia la selección ni el borrador", () => {
  const s = apply(prepared("a-01"), edit({ subject: "En curso" }));
  const t = core.reduce(s, { type: "panel/open", id: "a-07", openerKey: "k" });
  assert.equal(t.selectedId, "a-01");
  assert.deepEqual(t.drafts, s.drafts);
});

test("la ficha se cierra al pasar a carga, error, vacío, otro espacio o preparar", () => {
  const open = (s) => apply(s, { type: "panel/open", id: "a-01", openerKey: "k" });
  assert.equal(core.reduce(open(sample()), { type: "scenario/request", value: "loading" }).panel, null);
  assert.equal(core.reduce(open(sample()), { type: "scenario/request", value: "error" }).panel, null);
  assert.equal(core.reduce(open(sample()), { type: "scenario/request", value: "empty" }).panel, null);
  assert.equal(core.reduce(open(sample()), { type: "workspace/request", value: "b" }).panel, null);
  assert.equal(core.reduce(open(sample()), { type: "prepare", id: "a-01" }).panel, null);
});

test("cerrar la ficha descarta el error del formulario de acciones", () => {
  const s = apply(sample(), { type: "panel/open", id: "a-01", openerKey: "k" }, createInternal("a-01", " "));
  assert.equal(typeof s.panelError, "string");
  assert.equal(core.reduce(s, { type: "panel/close" }).panelError, null);
});

/* ------------------------------------------------------------------ */
/* 16. Mensajes y capacidades                                          */
/* ------------------------------------------------------------------ */

test("éxitos locales como estado y fallos como alerta; ninguno afirma un envío real", () => {
  assert.equal(core.reduce(prepared(), save()).notice.kind, "alert", "guardar un borrador vacío es un fallo");

  const ok = apply(prepared(), edit({ ...VALID }), save());
  assert.equal(ok.notice.kind, "status");
  assert.match(ok.notice.text, /no se ha enviado nada/i);

  assert.equal(core.reduce(sample(), { type: "prepare", id: "a-02" }).notice.kind, "alert");
  assert.equal(core.reduce(sample(), createInternal("a-07", "")).notice.kind, "alert");
  for (const s of [prepared(), ok, reviewed()]) assert.ok(!/gmail|correo enviado|enviado correctamente/i.test(s.notice.text));
});

test("cada transición con aviso incrementa la secuencia y las que no cambian nada no la tocan", () => {
  const s = sample();
  const a = core.reduce(s, { type: "prepare", id: "a-01" });
  assert.equal(a.noticeSeq, s.noticeSeq + 1);
  const same = core.reduce(a, { type: "prepare", id: "zz-99" });
  assert.equal(same.noticeSeq, a.noticeSeq);
  assert.equal(core.reduce(reviewed(), review(AT2)).noticeSeq, reviewed().noticeSeq);
});

test("las capacidades externas son cuatro, explican su ausencia de conexión y ninguna se llama «Enviar»", () => {
  assert.deepEqual(core.CAPABILITIES.map((c) => c.label), ["Correo", "Reunión", "Documento", "Informe"]);
  for (const cap of core.CAPABILITIES) {
    assert.ok(cap.reason.length > 0, `${cap.id}: falta motivo`);
    assert.ok(cap.effect.length > 0, `${cap.id}: falta efecto`);
    assert.ok(!/^enviar/i.test(cap.label));
  }
  const byId = Object.fromEntries(core.CAPABILITIES.map((c) => [c.id, c]));
  assert.ok(Array.isArray(byId.reunion.fields) && byId.reunion.fields.length > 0);
  assert.ok(Array.isArray(byId.documento.fields) && byId.documento.fields.length > 0);
  assert.equal(byId.correo.fields, null);
  assert.equal(byId.informe.fields, null);
});

/* ------------------------------------------------------------------ */
/* 17. Inmutabilidad y determinismo                                    */
/* ------------------------------------------------------------------ */

const BATTERY = [
  { type: "scenario/request", value: "sample" },
  { type: "view", view: "comercial" },
  { type: "select", id: "a-07" },
  { type: "queue/toggle" }, { type: "queue/query", value: "contacto" }, { type: "queue/more" },
  { type: "today/query", value: "recepción" }, { type: "today/filter", value: "review" }, { type: "today/more" }, { type: "today/clear" },
  { type: "tab", tab: "archivos" }, { type: "files/mode", value: "empty" }, { type: "files/query", value: "x" },
  { type: "fields/toggle", name: "reunion" },
  { type: "prepare", id: "a-01" },
  edit({ ...VALID, internal: true, internalDue: "2026-11-05" }),
  save(), confirm(), review(),
  { check: (s) => assert.equal(core.internalFor(s).length, 1) },
  { type: "panel/open", id: "a-01", openerKey: "k" },
  createInternal("a-01", "Llamar"),
  done,
  { check: (s) => assert.equal(core.internalFor(s).length, 2) },
  (s) => ({ type: "internal/complete", id: core.internalFor(s)[0].id }),
  done,
  createInternal("a-01", "   "),
  { type: "panel/close" },
  { type: "manual/open" },
  edit({ to: "x@example.invalid", subject: "Tema", body: "Texto" }),
  { type: "workspace/request", value: "b" },
  { check: (s) => assert.ok(s.pendingReset, "debía pedir confirmación") },
  { type: "reset/cancel" },
  { type: "workspace/request", value: "b" },
  { type: "reset/confirm" },
  { type: "scenario/request", value: "loading" },
  { type: "scenario/request", value: "error" },
  { type: "scenario/request", value: "empty" }
];

function runBattery({ freeze }) {
  let s = fresh();
  if (freeze) deepFreeze(s);
  for (const step of BATTERY) {
    if (step.check) { step.check(s); continue; }
    const action = typeof step === "function" ? step(s) : step;
    if (freeze) deepFreeze(action);
    const before = JSON.stringify(s);
    const next = core.reduce(s, action);
    assert.equal(JSON.stringify(s), before, `la acción ${action.type} modificó el estado de entrada`);
    s = freeze ? deepFreeze(next) : next;
  }
  return s;
}

test("reduce no muta el estado ni las acciones de entrada ni los datos de muestra", () => {
  const datasets = () => JSON.stringify([core.datasetFor(sample()), core.datasetFor(inWorkspaceB())]);
  const before = datasets();
  const final = runBattery({ freeze: true });
  assert.equal(final.scenario, "empty");
  assert.equal(datasets(), before, "los datos de muestra cambiaron");
});

test("las mismas acciones sobre el mismo estado inicial producen el mismo resultado", () => {
  assert.deepEqual(runBattery({ freeze: false }), runBattery({ freeze: false }));
});

test("cada estado inicial es independiente: no comparte objetos mutables con otro", () => {
  const a = fresh();
  const b = fresh();
  assert.deepEqual(a, b);
  for (const key of ["drafts", "prepared", "internal", "pending", "openFields"]) assert.notEqual(a[key], b[key], key);
  assert.notEqual(a.internal.a, b.internal.a);
});

/* ------------------------------------------------------------------ */
/* 18. CONTRADICCIONES brief ↔ núcleo (todo: describen el contrato esperado) */
/* ------------------------------------------------------------------ */

test("CONTRADICCIÓN · en el escenario vacío, select no debe fijar un cliente de muestra",
  { todo: "brief: «No inventes clientes» en el vacío. El reductor acepta select de a-01 sin comprobar dataAvailable." },
  () => {
    const r = core.reduce(fresh(), { type: "select", id: "a-01" });
    assert.equal(r.selectedId, null);
    assert.equal(core.selectedClient(r), null, "el vacío mostraría un cliente de muestra");
  });

test("CONTRADICCIÓN · select del borrador sin cliente exige que ese borrador exista",
  { todo: "select acepta MANUAL_ID sin borrador: queda seleccionado un «cliente» sin borrador ni procedencia." },
  () => {
    const r = core.reduce(fresh(), { type: "select", id: core.MANUAL_ID });
    assert.equal(r.selectedId, null);
  });

test("CONTRADICCIÓN · una acción interna terminada tras cambiar de espacio no se escribe en el espacio nuevo",
  { todo: "op/done usa state.workspaceId actual y no el del espacio donde se pidió la operación (carga sin cruce de contexto)." },
  () => {
    const pending = core.reduce(sample(), createInternal("a-07", "Llamar"));
    const inB = core.reduce(pending, { type: "workspace/request", value: "b" });
    assert.equal(inB.workspaceId, "b");
    const finished = core.reduce(inB, done(inB));
    assert.equal(core.internalFor(finished).some((x) => x.clientId === "a-07"), false, "la acción de A aparece en B");
    const backToA = core.reduce(finished, { type: "workspace/request", value: "a" });
    assert.equal(core.internalFor(backToA).some((x) => x.title === "Llamar"), true, "la acción de A se perdió");
  });

test("CONTRADICCIÓN · completar una acción interna pedida antes de cambiar de espacio no se pierde",
  { todo: "el op/done de completar se aplica al espacio actual: la acción de A sigue pendiente aunque se informó «completada»." },
  () => {
    const created = withInternal(sample(), "a-07", "Revisar presupuesto");
    const id = core.internalFor(created)[0].id;
    const pending = core.reduce(created, { type: "internal/complete", id });
    const inB = core.reduce(pending, { type: "workspace/request", value: "b" });
    const finished = core.reduce(inB, done(inB));
    const backToA = core.reduce(finished, { type: "workspace/request", value: "a" });
    assert.equal(core.internalFor(backToA).find((x) => x.id === id).done, true);
  });

test("CONTRADICCIÓN · una segunda apertura de la ficha conserva el disparador original",
  { todo: "panel/open reemplaza openerKey; si se invoca con el panel abierto, el foco se restauraría a un elemento interno del panel." },
  () => {
    const s = apply(sample(), { type: "panel/open", id: "a-01", openerKey: "row-open-a-01-t1" }, { type: "panel/open", id: "a-01", openerKey: "panel-close" });
    assert.equal(s.panel.openerKey, "row-open-a-01-t1");
  });

test("CONTRADICCIÓN · un borrador sin cliente no crea acciones internas huérfanas",
  { todo: "draft/edit acepta internal:true también en el borrador manual; al revisar se crea una acción con clientId null que ningún selector muestra." },
  () => {
    const s = apply(core.reduce(fresh(), { type: "manual/open" }), edit({ to: "persona@example.invalid", ...VALID, internal: true }), save(), confirm(), review());
    assert.equal(core.internalFor(s).filter((a) => a.clientId === null).length, 0);
  });

test("CONTRADICCIÓN · guardar permite conservar trabajo incompleto; solo revisar exige contenido válido",
  { todo: "brief: la validez se exige a la casilla «He revisado…» y a «Marcar revisión local». El núcleo también rechaza Guardar, así que un borrador a medias nunca queda guardado y siempre avisa de cambios sin guardar." },
  () => {
    const s = apply(core.reduce(fresh(), { type: "manual/open" }), edit({ subject: "Solo el asunto" }), save());
    assert.notEqual(draftOf(s, core.MANUAL_ID).snapshot, null);
    assert.equal(core.unsavedCount(s), 0);
  });

test("CONTRADICCIÓN · el aviso al intentar preparar explica todas las causas, no solo la primera",
  { todo: "brief: «Explica las causas…». El aviso de prepare usa solo blockers[0]; con solo lectura + sin correo omite la segunda." },
  () => {
    const s = inScenario("readonly");
    const blockers = core.prepareBlockers(s, core.clientById(s, "a-02"));
    assert.equal(blockers.length, 2);
    const t = core.reduce(s, { type: "prepare", id: "a-02" });
    for (const b of blockers) assert.ok(t.notice.text.includes(b.text), `falta la causa «${b.code}»`);
  });

test("CONTRADICCIÓN · valores no textuales en una edición no deben romper la validación",
  { todo: "draft/edit asigna null/número al contenido y validateContent lanza TypeError al hacer trim() (robustez del reductor)." },
  () => {
    const s = apply(prepared(), edit({ subject: null }));
    assert.doesNotThrow(() => core.validateContent(draftOf(s).content));
    assert.doesNotThrow(() => core.reviewHint(draftOf(s)));
  });
