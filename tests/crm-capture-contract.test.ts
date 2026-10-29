import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CaptureContractError,
  CrmCaptureContract,
  type CaptureBinding,
  type CapturePage,
  type Entity,
} from '../shared/crm-capture-contract.js';

const BINDING: CaptureBinding = { tenantId: 'tenant-a', portalId: 'portal-1', generation: 1 };

function expectCode(action: () => unknown, code: string): void {
  assert.throws(action, (error: unknown) => {
    assert.ok(error instanceof CaptureContractError, 'debe ser CaptureContractError');
    assert.equal(error.code, code);
    return true;
  });
}

function assertDeepFrozen(value: unknown): void {
  if (typeof value !== 'object' || value === null) return;
  assert.ok(Object.isFrozen(value), 'objeto sin congelar');
  for (const child of Object.values(value)) assertDeepFrozen(child);
}

function single(entity: Entity = 'contacts'): CrmCaptureContract {
  return new CrmCaptureContract({ ...BINDING }, [entity]);
}

function page(ids: string[], nextCursor: string | null, total?: number): CapturePage {
  return total === undefined ? { ids, nextCursor } : { ids, nextCursor, total };
}

// Tras un error, el acumulador queda invalidado de forma permanente y nunca publica.
function assertInvalidated(contract: CrmCaptureContract): void {
  expectCode(() => contract.addPage(BINDING, 'contacts', null, page(['x'], null)), 'INVALIDATED');
  expectCode(() => contract.finalize(BINDING), 'INVALIDATED');
}

describe('CrmCaptureContract: recorrido positivo', () => {
  it('acepta un recorrido multientidad con paginas y totales coherentes', () => {
    const contract = new CrmCaptureContract({ ...BINDING }, ['contacts', 'companies', 'deals', 'tasks']);
    contract.addPage(BINDING, 'contacts', null, page(['c1', 'c2'], 'p2', 3));
    contract.addPage(BINDING, 'companies', null, page(['k1'], null, 1));
    contract.addPage(BINDING, 'contacts', 'p2', page(['c3'], null, 3));
    contract.addPage(BINDING, 'deals', null, page([], null));
    contract.addPage(BINDING, 'tasks', null, page(['t1', 't2'], 'x', 2));
    contract.addPage(BINDING, 'tasks', 'x', page([], null));

    const summary = contract.finalize(BINDING);
    assert.equal(summary.complete, true);
    assert.deepEqual(summary.binding, BINDING);
    assert.equal(summary.totalPages, 6);
    assert.equal(summary.totalRecords, 6);
    assert.deepEqual(summary.entities, {
      contacts: { pages: 2, records: 3 },
      companies: { pages: 1, records: 1 },
      deals: { pages: 1, records: 0 },
      tasks: { pages: 2, records: 2 },
    });
  });

  it('permite intercalar entidades porque cada una lleva su propio cursor', () => {
    const contract = new CrmCaptureContract({ ...BINDING }, ['contacts', 'deals']);
    contract.addPage(BINDING, 'contacts', null, page(['a'], 'n1'));
    contract.addPage(BINDING, 'deals', null, page(['a'], 'n1'));
    contract.addPage(BINDING, 'deals', 'n1', page(['b'], null));
    contract.addPage(BINDING, 'contacts', 'n1', page(['b'], null));
    assert.equal(contract.finalize(BINDING).totalRecords, 4);
  });

  it('acepta el mismo ID en tipos diferentes', () => {
    const contract = new CrmCaptureContract({ ...BINDING }, ['contacts', 'companies', 'deals', 'tasks']);
    for (const entity of ['contacts', 'companies', 'deals', 'tasks'] as const) {
      contract.addPage(BINDING, entity, null, page(['7'], null, 1));
    }
    assert.equal(contract.finalize(BINDING).totalRecords, 4);
  });

  it('no convierte ni normaliza IDs: mayusculas y minusculas son distintos', () => {
    const contract = single();
    contract.addPage(BINDING, 'contacts', null, page(['ID-1', 'id-1', '01', '1'], null, 4));
    assert.equal(contract.finalize(BINDING).totalRecords, 4);
  });

  it('acepta una pagina vacia terminal con total ausente o cero', () => {
    const sinTotal = single();
    sinTotal.addPage(BINDING, 'contacts', null, page([], null));
    assert.equal(sinTotal.finalize(BINDING).totalRecords, 0);

    const conCero = single();
    conCero.addPage(BINDING, 'contacts', null, page([], null, 0));
    assert.equal(conCero.finalize(BINDING).entities.contacts?.records, 0);
  });

  it('rechaza una vacia terminal que contradice un total declarado antes', () => {
    const contract = single();
    contract.addPage(BINDING, 'contacts', null, page(['a'], 'n', 3));
    expectCode(() => contract.addPage(BINDING, 'contacts', 'n', page([], null)), 'COUNT_MISMATCH');
  });
});

describe('CrmCaptureContract: constructor', () => {
  const cases: Array<[string, () => unknown]> = [
    ['binding null', () => new CrmCaptureContract(null as never, ['contacts'])],
    ['tenantId vacio', () => new CrmCaptureContract({ ...BINDING, tenantId: '' }, ['contacts'])],
    ['tenantId con espacios', () => new CrmCaptureContract({ ...BINDING, tenantId: ' t' }, ['contacts'])],
    ['portalId no string', () => new CrmCaptureContract({ ...BINDING, portalId: 5 as never }, ['contacts'])],
    ['portalId con espacio final', () => new CrmCaptureContract({ ...BINDING, portalId: 'p ' }, ['contacts'])],
    ['generation negativa', () => new CrmCaptureContract({ ...BINDING, generation: -1 }, ['contacts'])],
    ['generation decimal', () => new CrmCaptureContract({ ...BINDING, generation: 1.5 }, ['contacts'])],
    ['generation NaN', () => new CrmCaptureContract({ ...BINDING, generation: Number.NaN }, ['contacts'])],
    ['generation no segura', () => new CrmCaptureContract({ ...BINDING, generation: 2 ** 53 }, ['contacts'])],
    ['entities no array', () => new CrmCaptureContract(BINDING, 'contacts' as never)],
    ['entities vacio', () => new CrmCaptureContract(BINDING, [])],
    ['entities duplicadas', () => new CrmCaptureContract(BINDING, ['contacts', 'contacts'])],
    ['entidad desconocida', () => new CrmCaptureContract(BINDING, ['notes' as never])],
    ['entidad heredada', () => new CrmCaptureContract(BINDING, ['constructor' as never])],
    ['limits null', () => new CrmCaptureContract(BINDING, ['contacts'], null as never)],
    ['maxPages cero', () => new CrmCaptureContract(BINDING, ['contacts'], { maxPages: 0 })],
    ['maxPages decimal', () => new CrmCaptureContract(BINDING, ['contacts'], { maxPages: 1.5 })],
    ['maxRecords negativo', () => new CrmCaptureContract(BINDING, ['contacts'], { maxRecords: -5 })],
    ['maxRecords no seguro', () => new CrmCaptureContract(BINDING, ['contacts'], { maxRecords: 2 ** 60 })],
    ['maxRecords no numerico', () => new CrmCaptureContract(BINDING, ['contacts'], { maxRecords: '5' as never })],
  ];
  for (const [name, build] of cases) {
    it(`lanza INVALID_INPUT: ${name}`, () => expectCode(build, 'INVALID_INPUT'));
  }

  it('acepta generation 0 y limites explicitamente indefinidos', () => {
    const contract = new CrmCaptureContract({ ...BINDING, generation: 0 }, ['tasks'], {
      maxPages: undefined,
      maxRecords: undefined,
    });
    contract.addPage({ ...BINDING, generation: 0 }, 'tasks', null, page([], null));
    assert.equal(contract.finalize({ ...BINDING, generation: 0 }).binding.generation, 0);
  });
});

describe('CrmCaptureContract: errores y fallo cerrado', () => {
  it('BINDING_MISMATCH en tenant, portal y generation, tambien en finalize', () => {
    for (const other of [
      { ...BINDING, tenantId: 'tenant-b' },
      { ...BINDING, portalId: 'portal-2' },
      { ...BINDING, generation: 2 },
    ]) {
      const contract = single();
      expectCode(() => contract.addPage(other, 'contacts', null, page([], null)), 'BINDING_MISMATCH');
      assertInvalidated(contract);

      const other2 = single();
      other2.addPage(BINDING, 'contacts', null, page([], null));
      expectCode(() => other2.finalize(other), 'BINDING_MISMATCH');
      assertInvalidated(other2);
    }
  });

  it('INVALID_INPUT para binding malformado en addPage', () => {
    const contract = single();
    expectCode(() => contract.addPage(undefined as never, 'contacts', null, page([], null)), 'INVALID_INPUT');
    assertInvalidated(contract);
  });

  it('UNKNOWN_ENTITY para entidad no configurada o ajena', () => {
    for (const entity of ['companies', 'notes', '__proto__', 'constructor', 7, null]) {
      const contract = single();
      expectCode(() => contract.addPage(BINDING, entity as never, null, page([], null)), 'UNKNOWN_ENTITY');
      assertInvalidated(contract);
    }
  });

  it('CURSOR_MISMATCH: cursor inicial no nulo, distinto del esperado o tras terminar', () => {
    const inicial = single();
    expectCode(() => inicial.addPage(BINDING, 'contacts', 'zz', page(['a'], null)), 'CURSOR_MISMATCH');
    assertInvalidated(inicial);

    const distinto = single();
    distinto.addPage(BINDING, 'contacts', null, page(['a'], 'n1'));
    expectCode(() => distinto.addPage(BINDING, 'contacts', 'n9', page(['b'], null)), 'CURSOR_MISMATCH');
    assertInvalidated(distinto);

    const repetidaNula = single();
    repetidaNula.addPage(BINDING, 'contacts', null, page(['a'], 'n1'));
    expectCode(() => repetidaNula.addPage(BINDING, 'contacts', null, page(['a'], 'n1')), 'CURSOR_MISMATCH');

    const trasTerminar = new CrmCaptureContract(BINDING, ['contacts', 'deals']);
    trasTerminar.addPage(BINDING, 'contacts', null, page(['a'], null));
    expectCode(() => trasTerminar.addPage(BINDING, 'contacts', null, page(['b'], null)), 'CURSOR_MISMATCH');
    assertInvalidated(trasTerminar);
  });

  it('CURSOR_LOOP: nextCursor igual al actual, a uno previo o cursor ya consumido', () => {
    const auto = single();
    auto.addPage(BINDING, 'contacts', null, page(['a'], 'n1'));
    expectCode(() => auto.addPage(BINDING, 'contacts', 'n1', page(['b'], 'n1')), 'CURSOR_LOOP');
    assertInvalidated(auto);

    const previo = single();
    previo.addPage(BINDING, 'contacts', null, page(['a'], 'n1'));
    previo.addPage(BINDING, 'contacts', 'n1', page(['b'], 'n2'));
    expectCode(() => previo.addPage(BINDING, 'contacts', 'n2', page(['c'], 'n1')), 'CURSOR_LOOP');
    assertInvalidated(previo);

    const reutilizado = single();
    reutilizado.addPage(BINDING, 'contacts', null, page(['a'], 'n1'));
    reutilizado.addPage(BINDING, 'contacts', 'n1', page(['b'], 'n2'));
    expectCode(() => reutilizado.addPage(BINDING, 'contacts', 'n1', page(['c'], null)), 'CURSOR_LOOP');
    assertInvalidated(reutilizado);
  });

  it('DUPLICATE_ID dentro de una pagina y entre paginas de la misma entidad', () => {
    const dentro = single();
    expectCode(() => dentro.addPage(BINDING, 'contacts', null, page(['a', 'b', 'a'], null)), 'DUPLICATE_ID');
    assertInvalidated(dentro);

    const entre = single();
    entre.addPage(BINDING, 'contacts', null, page(['a', 'b'], 'n1'));
    expectCode(() => entre.addPage(BINDING, 'contacts', 'n1', page(['c', 'b'], null)), 'DUPLICATE_ID');
    assertInvalidated(entre);
  });

  it('TOTAL_CHANGED cuando un total ya declarado se redeclara distinto', () => {
    const contract = single();
    contract.addPage(BINDING, 'contacts', null, page(['a'], 'n1', 2));
    expectCode(() => contract.addPage(BINDING, 'contacts', 'n1', page(['b'], null, 3)), 'TOTAL_CHANGED');
    assertInvalidated(contract);
  });

  it('COUNT_MISMATCH al terminar por defecto o por exceso', () => {
    const defecto = single();
    expectCode(() => defecto.addPage(BINDING, 'contacts', null, page(['a'], null, 2)), 'COUNT_MISMATCH');
    assertInvalidated(defecto);

    const exceso = single();
    exceso.addPage(BINDING, 'contacts', null, page(['a', 'b'], 'n1', 2));
    expectCode(() => exceso.addPage(BINDING, 'contacts', 'n1', page(['c'], null)), 'COUNT_MISMATCH');
    assertInvalidated(exceso);
  });

  it('EMPTY_PAGE: vacia con cursor siguiente no acredita progreso', () => {
    const contract = single();
    expectCode(() => contract.addPage(BINDING, 'contacts', null, page([], 'n1')), 'EMPTY_PAGE');
    assertInvalidated(contract);
  });

  it('LIMIT_EXCEEDED por paginas y por registros, con limites globales entre entidades', () => {
    const paginas = new CrmCaptureContract(BINDING, ['contacts'], { maxPages: 2 });
    paginas.addPage(BINDING, 'contacts', null, page(['a'], 'n1'));
    paginas.addPage(BINDING, 'contacts', 'n1', page(['b'], 'n2'));
    expectCode(() => paginas.addPage(BINDING, 'contacts', 'n2', page(['c'], null)), 'LIMIT_EXCEEDED');
    assertInvalidated(paginas);

    const registros = new CrmCaptureContract(BINDING, ['contacts'], { maxRecords: 2 });
    expectCode(() => registros.addPage(BINDING, 'contacts', null, page(['a', 'b', 'c'], null)), 'LIMIT_EXCEEDED');
    assertInvalidated(registros);

    const globalPaginas = new CrmCaptureContract(BINDING, ['contacts', 'deals'], { maxPages: 1 });
    globalPaginas.addPage(BINDING, 'contacts', null, page(['a'], null));
    expectCode(() => globalPaginas.addPage(BINDING, 'deals', null, page(['a'], null)), 'LIMIT_EXCEEDED');

    const globalRegistros = new CrmCaptureContract(BINDING, ['contacts', 'deals'], { maxRecords: 3 });
    globalRegistros.addPage(BINDING, 'contacts', null, page(['a', 'b'], null));
    expectCode(() => globalRegistros.addPage(BINDING, 'deals', null, page(['a', 'b'], null)), 'LIMIT_EXCEEDED');
  });

  it('el limite exacto se acepta', () => {
    const contract = new CrmCaptureContract(BINDING, ['contacts', 'deals'], { maxPages: 2, maxRecords: 3 });
    contract.addPage(BINDING, 'contacts', null, page(['a', 'b'], null));
    contract.addPage(BINDING, 'deals', null, page(['a'], null));
    assert.equal(contract.finalize(BINDING).totalRecords, 3);
  });

  it('INCOMPLETE si finalize llega antes de terminar todas las entidades, e invalida', () => {
    const contract = new CrmCaptureContract(BINDING, ['contacts', 'deals']);
    contract.addPage(BINDING, 'contacts', null, page(['a'], null));
    expectCode(() => contract.finalize(BINDING), 'INCOMPLETE');
    assertInvalidated(contract);

    const enCurso = single();
    enCurso.addPage(BINDING, 'contacts', null, page(['a'], 'n1'));
    expectCode(() => enCurso.finalize(BINDING), 'INCOMPLETE');

    const sinPaginas = single();
    expectCode(() => sinPaginas.finalize(BINDING), 'INCOMPLETE');
  });

  it('INVALID_INPUT para paginas, IDs, cursores y totales malformados', () => {
    const malos: Array<[string, unknown, unknown]> = [
      ['page null', null, null],
      ['page no objeto', 'x', null],
      ['ids no array', { ids: 'abc', nextCursor: null }, null],
      ['ids ausente', { nextCursor: null }, null],
      ['id vacio', { ids: [''], nextCursor: null }, null],
      ['id con espacios', { ids: [' a'], nextCursor: null }, null],
      ['id numerico', { ids: [1], nextCursor: null }, null],
      ['id hueco', { ids: new Array(1), nextCursor: null }, null],
      ['nextCursor undefined', { ids: ['a'] }, null],
      ['nextCursor vacio', { ids: ['a'], nextCursor: '' }, null],
      ['nextCursor con espacios', { ids: ['a'], nextCursor: 'n ' }, null],
      ['total negativo', { ids: ['a'], nextCursor: null, total: -1 }, null],
      ['total decimal', { ids: ['a'], nextCursor: null, total: 1.5 }, null],
      ['total NaN', { ids: ['a'], nextCursor: null, total: Number.NaN }, null],
      ['total no seguro', { ids: ['a'], nextCursor: null, total: 2 ** 53 }, null],
      ['total string', { ids: ['a'], nextCursor: null, total: '1' }, null],
      ['cursor de entrada vacio', { ids: ['a'], nextCursor: null }, ''],
      ['cursor de entrada numerico', { ids: ['a'], nextCursor: null }, 0],
      ['cursor de entrada undefined', { ids: ['a'], nextCursor: null }, undefined],
    ];
    for (const [name, malo, cursor] of malos) {
      const contract = single();
      expectCode(() => contract.addPage(BINDING, 'contacts', cursor as never, malo as never), 'INVALID_INPUT');
      assert.throws(() => contract.finalize(BINDING), (e: unknown) => e instanceof CaptureContractError && e.code === 'INVALIDATED', name);
    }
  });

  it('un getter hostil se convierte en INVALID_INPUT e invalida', () => {
    const contract = single();
    const hostil = {
      get ids(): string[] {
        throw new Error('boom');
      },
      nextCursor: null,
    };
    expectCode(() => contract.addPage(BINDING, 'contacts', null, hostil as never), 'INVALID_INPUT');
    assertInvalidated(contract);
  });

  it('un error posterior a paginas validas nunca deja un resumen publicable', () => {
    const contract = new CrmCaptureContract(BINDING, ['contacts', 'deals']);
    contract.addPage(BINDING, 'contacts', null, page(['a'], null));
    contract.addPage(BINDING, 'deals', null, page(['x'], 'n1'));
    expectCode(() => contract.addPage(BINDING, 'deals', 'n1', page(['x'], null)), 'DUPLICATE_ID');
    expectCode(() => contract.finalize(BINDING), 'INVALIDATED');
    expectCode(() => contract.addPage(BINDING, 'deals', 'n1', page(['y'], null)), 'INVALIDATED');
  });
});

describe('CrmCaptureContract: aislamiento y resumen', () => {
  it('no retiene referencias mutables de entrada', () => {
    const binding = { ...BINDING };
    const entities: Entity[] = ['contacts'];
    const contract = new CrmCaptureContract(binding, entities);
    binding.tenantId = 'otro';
    binding.generation = 99;
    entities.push('deals');

    const ids = ['a', 'b'];
    contract.addPage(BINDING, 'contacts', null, { ids, nextCursor: 'n1' });
    ids[0] = 'zzz';
    ids.push('qqq');

    // Si guardara la referencia de ids, 'a' ya no estaria y no habria duplicado.
    expectCode(() => contract.addPage(BINDING, 'contacts', 'n1', page(['a'], null)), 'DUPLICATE_ID');
  });

  it('el resumen coincide con el binding original aunque se mute el objeto de entrada', () => {
    const binding = { ...BINDING };
    const contract = new CrmCaptureContract(binding, ['contacts']);
    contract.addPage(BINDING, 'contacts', null, page(['a'], null));
    binding.portalId = 'otro';
    const summary = contract.finalize(BINDING);
    assert.deepEqual(summary.binding, BINDING);
  });

  it('devuelve un resumen profundamente congelado', () => {
    const contract = new CrmCaptureContract(BINDING, ['contacts', 'tasks']);
    contract.addPage(BINDING, 'contacts', null, page(['a'], null));
    contract.addPage(BINDING, 'tasks', null, page(['a'], null));
    const summary = contract.finalize({ ...BINDING });

    assertDeepFrozen(summary);
    assert.throws(() => {
      (summary as { totalPages: number }).totalPages = 99;
    }, TypeError);
    assert.throws(() => {
      (summary.binding as { tenantId: string }).tenantId = 'x';
    }, TypeError);
    assert.throws(() => {
      (summary.entities as Record<string, unknown>).deals = { pages: 1, records: 1 };
    }, TypeError);
    assert.throws(() => {
      (summary.entities.contacts as { records: number }).records = 50;
    }, TypeError);
    assert.equal(summary.totalPages, 2);
  });

  it('finalize repetido con binding igual es idempotente', () => {
    const contract = single();
    contract.addPage(BINDING, 'contacts', null, page(['a'], null));
    const primero = contract.finalize(BINDING);
    const segundo = contract.finalize({ ...BINDING });
    assert.deepEqual(segundo, primero);
    assert.equal(segundo.totalRecords, 1);
  });

  it('addPage tras finalize lanza FINALIZED sin destruir el resumen', () => {
    const contract = single();
    contract.addPage(BINDING, 'contacts', null, page(['a'], null));
    const resumen = contract.finalize(BINDING);

    expectCode(() => contract.addPage(BINDING, 'contacts', null, page(['b'], null)), 'FINALIZED');
    expectCode(() => contract.addPage({ ...BINDING, tenantId: 'x' }, 'deals' as never, 'c', null as never), 'FINALIZED');

    assert.deepEqual(contract.finalize(BINDING), resumen);
    assert.equal(contract.finalize(BINDING).totalRecords, 1);
  });

  it('finalize con binding ajeno tras finalizar falla sin destruir el resumen', () => {
    const contract = single();
    contract.addPage(BINDING, 'contacts', null, page(['a'], null));
    const resumen = contract.finalize(BINDING);
    expectCode(() => contract.finalize({ ...BINDING, generation: 7 }), 'BINDING_MISMATCH');
    assert.deepEqual(contract.finalize(BINDING), resumen);
    expectCode(() => contract.addPage(BINDING, 'contacts', null, page([], null)), 'FINALIZED');
  });

  it('el resumen solo incluye las entidades configuradas', () => {
    const contract = new CrmCaptureContract(BINDING, ['deals']);
    contract.addPage(BINDING, 'deals', null, page(['d'], null));
    assert.deepEqual(Object.keys(contract.finalize(BINDING).entities), ['deals']);
  });
});
