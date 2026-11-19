import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { describe, it } from 'node:test';
import { CaptureContractError, type CaptureBinding, type Entity } from '../shared/crm-capture-contract.js';
import {
  CaptureReadError,
  CaptureRunnerError,
  runCrmCapture,
  type CaptureItem,
  type RunnerOptions,
  type RunnerPage,
  type RunnerRequest,
} from '../shared/crm-capture-runner.js';

interface Item extends CaptureItem {
  name?: string;
  meta?: { n: number };
}

const B: CaptureBinding = { tenantId: 'tenant-a', portalId: 'portal-1', generation: 3 };

const hang = (): Promise<never> => new Promise<never>(() => {});
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function page(ids: string[], nextCursor: string | null, total?: number): RunnerPage<Item> {
  const items = ids.map((id) => ({ id, name: `n-${id}` }));
  return total === undefined ? { items, nextCursor } : { items, nextCursor, total };
}

function opts(
  over: Partial<RunnerOptions<Item>> & Pick<RunnerOptions<Item>, 'readPage'>,
): RunnerOptions<Item> {
  return {
    binding: { ...B },
    entities: ['contacts'],
    getBinding: async () => ({ ...B }),
    sleep: async () => {},
    ...over,
  };
}

async function rejectsRunner(promise: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof CaptureRunnerError, `esperaba CaptureRunnerError, llego ${String(error)}`);
    assert.equal(error.code, code);
    return true;
  });
}

async function rejectsContract(promise: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof CaptureContractError, `esperaba CaptureContractError, llego ${String(error)}`);
    assert.equal(error.code, code);
    return true;
  });
}

function assertDeepFrozen(value: unknown): void {
  if (typeof value !== 'object' || value === null) return;
  assert.ok(Object.isFrozen(value), 'objeto sin congelar');
  for (const child of Object.values(value)) assertDeepFrozen(child);
}

// Transporte que falla N veces con el error indicado en la primera pagina y luego responde.
function flaky(errors: unknown[], thenPage: RunnerPage<Item> = page(['1'], null)) {
  const requests: RunnerRequest[] = [];
  let index = 0;
  const readPage = async (request: RunnerRequest): Promise<RunnerPage<Item>> => {
    requests.push(request);
    if (index < errors.length) throw errors[index++];
    return thenPage;
  };
  return { requests, readPage };
}

describe('runCrmCapture: recorrido', () => {
  it('recorre varias entidades en orden y devuelve los datos solo al final', async () => {
    const requests: RunnerRequest[] = [];
    const result = await runCrmCapture<Item>(
      opts({
        entities: ['contacts', 'companies'],
        readPage: async (request) => {
          requests.push(request);
          if (request.entity === 'contacts' && request.cursor === null) return page(['1', '2'], 'c2', 3);
          if (request.entity === 'contacts') return page(['3'], null, 3);
          return page(['1'], null);
        },
      }),
    );

    assert.deepEqual(
      requests.map((r) => [r.entity, r.cursor, r.attempt]),
      [
        ['contacts', null, 1],
        ['contacts', 'c2', 1],
        ['companies', null, 1],
      ],
    );
    for (const request of requests) {
      assert.deepEqual(request.binding, B);
      assert.ok(Object.isFrozen(request) && Object.isFrozen(request.binding));
      assert.equal(request.signal.aborted, false);
      assert.ok(!Object.isFrozen(request.signal));
    }
    assert.deepEqual(result.records.contacts?.map((i) => i.id), ['1', '2', '3']);
    assert.deepEqual(result.records.companies?.map((i) => i.id), ['1']); // mismo ID en otro tipo
    assert.equal(result.summary.complete, true);
    assert.equal(result.summary.totalPages, 3);
    assert.equal(result.summary.totalRecords, 4);
    assert.equal(result.attempts, 3);
    assert.equal(result.retries, 0);
  });

  it('acepta una entidad vacia y terminal', async () => {
    const result = await runCrmCapture<Item>(opts({ readPage: async () => page([], null, 0) }));
    assert.equal(result.summary.totalRecords, 0);
    assert.deepEqual(result.records.contacts, []);
  });

  it('el caller no puede alterar el contexto despues de llamar', async () => {
    const binding = { ...B };
    const entities: Entity[] = ['contacts'];
    const seen: RunnerRequest[] = [];
    const promise = runCrmCapture<Item>({
      binding,
      entities,
      readPage: async (request) => {
        seen.push(request);
        return page(['1'], null);
      },
      getBinding: async () => ({ ...B }),
    });
    binding.tenantId = 'evil';
    binding.generation = 99;
    entities.push('deals');
    const result = await promise;
    assert.deepEqual(result.summary.binding, B);
    assert.deepEqual(Object.keys(result.records), ['contacts']);
    assert.deepEqual(seen[0]?.binding, B);
  });

  it('usa el sleep por defecto con retrasos reales muy cortos', async () => {
    const { requests, readPage } = flaky([new CaptureReadError(503)]);
    const result = await runCrmCapture<Item>({
      binding: { ...B },
      entities: ['contacts'],
      readPage,
      getBinding: async () => ({ ...B }),
      baseDelayMs: 5,
      maxDelayMs: 5,
    });
    assert.equal(requests.length, 2);
    assert.equal(result.retries, 1);
  });
});

describe('runCrmCapture: reintentos', () => {
  it('reintenta por pagina, reinicia attempt y cuenta intentos reales', async () => {
    const sleeps: number[] = [];
    const attemptsSeen: number[] = [];
    let calls = 0;
    const result = await runCrmCapture<Item>(
      opts({
        baseDelayMs: 100,
        sleep: async (ms) => {
          sleeps.push(ms);
        },
        readPage: async (request) => {
          attemptsSeen.push(request.attempt);
          calls += 1;
          if (request.cursor === null) {
            if (calls === 1) throw new CaptureReadError(503);
            if (calls === 2) throw new CaptureReadError(429);
            return page(['1'], 'c2');
          }
          return page(['2'], null);
        },
      }),
    );
    assert.deepEqual(attemptsSeen, [1, 2, 3, 1]);
    assert.deepEqual(sleeps, [100, 200]);
    assert.equal(result.attempts, 4);
    assert.equal(result.retries, 2);
  });

  it('reintenta 429 y 500..599, nada mas', async () => {
    for (const status of [429, 500, 502, 599]) {
      const { requests, readPage } = flaky([new CaptureReadError(status)]);
      const result = await runCrmCapture<Item>(opts({ readPage }));
      assert.equal(requests.length, 2, `status ${status}`);
      assert.equal(result.retries, 1);
    }
  });

  it('Retry-After 0, valido con clamp, invalido y exponencial con clamp', async () => {
    const run = async (errors: unknown[], extra: Partial<RunnerOptions<Item>> = {}): Promise<number[]> => {
      const sleeps: number[] = [];
      const { readPage } = flaky(errors);
      await runCrmCapture<Item>(
        opts({
          readPage,
          maxAttempts: 4,
          baseDelayMs: 300,
          maxDelayMs: 500,
          sleep: async (ms) => {
            sleeps.push(ms);
          },
          ...extra,
        }),
      );
      return sleeps;
    };

    assert.deepEqual(await run([new CaptureReadError(429, 0)]), [0]);
    assert.deepEqual(await run([new CaptureReadError(429, 120)]), [120]);
    assert.deepEqual(await run([new CaptureReadError(429, 99_999)]), [500]);
    for (const invalid of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, undefined]) {
      assert.deepEqual(await run([new CaptureReadError(503, invalid)]), [300], `retryAfter ${String(invalid)}`);
    }
    const tres = [new CaptureReadError(503), new CaptureReadError(503), new CaptureReadError(503)];
    assert.deepEqual(await run(tres), [300, 500, 500]);
    // Un retryAfter valido prevalece sobre el exponencial en cualquier intento.
    assert.deepEqual(await run([new CaptureReadError(503), new CaptureReadError(503, 7)]), [300, 7]);
  });

  it('401, 403, 404 y errores genericos no se reintentan y se enmascaran como READ_FAILED', async () => {
    for (const status of [400, 401, 403, 404, 499, 600, 0]) {
      const sleeps: number[] = [];
      const { requests, readPage } = flaky([new CaptureReadError(status)]);
      await rejectsRunner(
        runCrmCapture<Item>(opts({ readPage, sleep: async (ms) => void sleeps.push(ms) })),
        'READ_FAILED',
      );
      assert.equal(requests.length, 1, `status ${status}`);
      assert.deepEqual(sleeps, []);
    }

    const { requests, readPage } = flaky([new Error('https://crm.example/api?token=SECRETO-123')]);
    await assert.rejects(runCrmCapture<Item>(opts({ readPage })), (error: unknown) => {
      assert.ok(error instanceof CaptureRunnerError);
      assert.equal(error.code, 'READ_FAILED');
      assert.equal((error as { cause?: unknown }).cause, undefined);
      assert.ok(!error.message.includes('SECRETO') && !error.message.includes('crm.example'));
      return true;
    });
    assert.equal(requests.length, 1);
  });

  it('agota reintentos: RETRY_EXHAUSTED tras maxAttempts llamadas', async () => {
    const sleeps: number[] = [];
    let calls = 0;
    await rejectsRunner(
      runCrmCapture<Item>(
        opts({
          maxAttempts: 3,
          readPage: async () => {
            calls += 1;
            throw new CaptureReadError(503);
          },
          sleep: async (ms) => void sleeps.push(ms),
        }),
      ),
      'RETRY_EXHAUSTED',
    );
    assert.equal(calls, 3);
    assert.equal(sleeps.length, 2);

    let single = 0;
    await rejectsRunner(
      runCrmCapture<Item>(
        opts({
          maxAttempts: 1,
          readPage: async () => {
            single += 1;
            throw new CaptureReadError(429);
          },
        }),
      ),
      'RETRY_EXHAUSTED',
    );
    assert.equal(single, 1);
  });

  it('un readPage que lanza de forma sincrona es READ_FAILED', async () => {
    await rejectsRunner(
      runCrmCapture<Item>(
        opts({
          readPage: () => {
            throw new Error('sync');
          },
        }),
      ),
      'READ_FAILED',
    );
  });
});

describe('runCrmCapture: identidad', () => {
  function switching(switchAt: number, replacement: Partial<CaptureBinding> = { portalId: 'portal-2' }) {
    let calls = 0;
    return {
      count: () => calls,
      getBinding: async (): Promise<CaptureBinding> => {
        calls += 1;
        return calls >= switchAt ? { ...B, ...replacement } : { ...B };
      },
    };
  }

  it('detecta el cambio ANTES de leer', async () => {
    const ctx = switching(1);
    let reads = 0;
    await rejectsRunner(
      runCrmCapture<Item>(
        opts({
          getBinding: ctx.getBinding,
          readPage: async () => {
            reads += 1;
            return page(['1'], null);
          },
        }),
      ),
      'BINDING_CHANGED',
    );
    assert.equal(reads, 0);
  });

  it('detecta el cambio DESPUES de leer y descarta la pagina', async () => {
    const ctx = switching(2);
    let reads = 0;
    await rejectsRunner(
      runCrmCapture<Item>(
        opts({
          getBinding: ctx.getBinding,
          readPage: async () => {
            reads += 1;
            return page(['1'], null);
          },
        }),
      ),
      'BINDING_CHANGED',
    );
    assert.equal(reads, 1);
  });

  it('el cambio tiene prioridad sobre un fallo de lectura', async () => {
    const ctx = switching(2);
    await rejectsRunner(
      runCrmCapture<Item>(
        opts({
          getBinding: ctx.getBinding,
          readPage: async () => {
            throw new Error('x');
          },
        }),
      ),
      'BINDING_CHANGED',
    );
  });

  it('detecta el cambio durante la espera de un retry sin lanzar otra lectura', async () => {
    let current: CaptureBinding = { ...B };
    let reads = 0;
    await rejectsRunner(
      runCrmCapture<Item>(
        opts({
          getBinding: async () => ({ ...current }),
          sleep: async () => {
            current = { ...B, tenantId: 'tenant-b' };
          },
          readPage: async () => {
            reads += 1;
            throw new CaptureReadError(503);
          },
        }),
      ),
      'BINDING_CHANGED',
    );
    assert.equal(reads, 1);
  });

  it('detecta el cambio justo antes de devolver', async () => {
    // llamadas: antes, despues y final (3)
    const ctx = switching(3, { generation: 4 });
    await rejectsRunner(
      runCrmCapture<Item>(opts({ getBinding: ctx.getBinding, readPage: async () => page(['1'], null) })),
      'BINDING_CHANGED',
    );
    assert.equal(ctx.count(), 3);
  });

  it('tenant, portal y generation se comparan por separado', async () => {
    for (const replacement of [{ tenantId: 'x' }, { portalId: 'x' }, { generation: 4 }]) {
      const ctx = switching(1, replacement);
      await rejectsRunner(
        runCrmCapture<Item>(opts({ getBinding: ctx.getBinding, readPage: async () => page(['1'], null) })),
        'BINDING_CHANGED',
      );
    }
  });

  it('un binding mal formado es BINDING_CHANGED', async () => {
    const malos: unknown[] = [
      null,
      undefined,
      'x',
      {},
      { ...B, tenantId: ' t' },
      { ...B, portalId: '' },
      { ...B, generation: -1 },
      { ...B, generation: 1.5 },
    ];
    for (const malo of malos) {
      await rejectsRunner(
        runCrmCapture<Item>(
          opts({ getBinding: async () => malo as never, readPage: async () => page(['1'], null) }),
        ),
        'BINDING_CHANGED',
      );
    }
  });

  it('un getBinding que falla es READ_FAILED, sin leer', async () => {
    let reads = 0;
    const readPage = async (): Promise<RunnerPage<Item>> => {
      reads += 1;
      return page(['1'], null);
    };
    await rejectsRunner(
      runCrmCapture<Item>(opts({ readPage, getBinding: async () => Promise.reject(new Error('boom')) })),
      'READ_FAILED',
    );
    await rejectsRunner(
      runCrmCapture<Item>(
        opts({
          readPage,
          getBinding: () => {
            throw new Error('sync');
          },
        }),
      ),
      'READ_FAILED',
    );
    assert.equal(reads, 0);
  });

  it('no confia en la referencia devuelta por getBinding ni en la mutacion posterior', async () => {
    const shared = { ...B };
    const result = await runCrmCapture<Item>(
      opts({
        getBinding: async () => shared,
        readPage: async (request) => {
          assert.throws(() => {
            (request.binding as { tenantId: string }).tenantId = 'evil';
          }, TypeError);
          return page(['1'], null);
        },
      }),
    );
    assert.deepEqual(result.summary.binding, B);
  });
});

describe('runCrmCapture: cancelacion y plazos', () => {
  it('una senal ya abortada cancela sin ninguna llamada', async () => {
    const controller = new AbortController();
    controller.abort();
    let calls = 0;
    await rejectsRunner(
      runCrmCapture<Item>(
        opts({
          signal: controller.signal,
          getBinding: async () => {
            calls += 1;
            return { ...B };
          },
          readPage: async () => {
            calls += 1;
            return page(['1'], null);
          },
        }),
      ),
      'CANCELLED',
    );
    assert.equal(calls, 0);
  });

  it('cancela rapido un readPage que ignora la senal y no vuelve a llamar', async () => {
    const controller = new AbortController();
    let reads = 0;
    let seen: AbortSignal | undefined;
    setTimeout(() => controller.abort(), 15);
    const start = Date.now();
    await rejectsRunner(
      runCrmCapture<Item>(
        opts({
          signal: controller.signal,
          readPage: (request) => {
            reads += 1;
            seen = request.signal;
            return hang();
          },
        }),
      ),
      'CANCELLED',
    );
    assert.ok(Date.now() - start < 1000);
    assert.equal(seen?.aborted, true, 'la senal por intento debe abortarse');
    await wait(30);
    assert.equal(reads, 1);
  });

  it('cancela durante la espera, con sleep cooperativo o que ignora la senal', async () => {
    const cooperative = (_ms: number, signal: AbortSignal): Promise<void> =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('abortado')), { once: true });
      });
    const stubborn = (): Promise<void> => hang();

    for (const sleep of [cooperative, stubborn]) {
      const controller = new AbortController();
      let reads = 0;
      setTimeout(() => controller.abort(), 20);
      await rejectsRunner(
        runCrmCapture<Item>(
          opts({
            signal: controller.signal,
            sleep,
            readPage: async () => {
              reads += 1;
              throw new CaptureReadError(503);
            },
          }),
        ),
        'CANCELLED',
      );
      await wait(30);
      assert.equal(reads, 1, 'no debe lanzarse otra lectura');
    }
  });

  it('cancela un getBinding colgado', async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 15);
    let reads = 0;
    await rejectsRunner(
      runCrmCapture<Item>(
        opts({
          signal: controller.signal,
          getBinding: () => hang(),
          readPage: async () => {
            reads += 1;
            return page(['1'], null);
          },
        }),
      ),
      'CANCELLED',
    );
    assert.equal(reads, 0);
  });

  it('TIMEOUT por requestTimeoutMs en readPage, sin reintento', async () => {
    let reads = 0;
    let seen: AbortSignal | undefined;
    const start = Date.now();
    await rejectsRunner(
      runCrmCapture<Item>(
        opts({
          requestTimeoutMs: 30,
          maxAttempts: 3,
          readPage: (request) => {
            reads += 1;
            seen = request.signal;
            return hang();
          },
        }),
      ),
      'TIMEOUT',
    );
    assert.ok(Date.now() - start < 1000);
    assert.equal(seen?.aborted, true);
    await wait(40);
    assert.equal(reads, 1);
  });

  it('TIMEOUT por requestTimeoutMs en un getBinding colgado', async () => {
    let reads = 0;
    await rejectsRunner(
      runCrmCapture<Item>(
        opts({
          requestTimeoutMs: 30,
          getBinding: () => hang(),
          readPage: async () => {
            reads += 1;
            return page(['1'], null);
          },
        }),
      ),
      'TIMEOUT',
    );
    assert.equal(reads, 0);
  });

  it('DEADLINE corta un readPage colgado aunque el timeout por peticion sea mayor', async () => {
    const start = Date.now();
    await rejectsRunner(
      runCrmCapture<Item>(opts({ deadlineMs: 40, requestTimeoutMs: 5000, readPage: () => hang() })),
      'DEADLINE',
    );
    assert.ok(Date.now() - start < 1000);
  });

  it('DEADLINE corta un sleep colgado y un getBinding colgado', async () => {
    let reads = 0;
    await rejectsRunner(
      runCrmCapture<Item>(
        opts({
          deadlineMs: 40,
          sleep: () => hang(),
          readPage: async () => {
            reads += 1;
            throw new CaptureReadError(503);
          },
        }),
      ),
      'DEADLINE',
    );
    assert.equal(reads, 1);

    await rejectsRunner(
      runCrmCapture<Item>(
        opts({ deadlineMs: 40, requestTimeoutMs: 5000, getBinding: () => hang(), readPage: async () => page([], null) }),
      ),
      'DEADLINE',
    );
  });

  it('DEADLINE interrumpe una secuencia de reintentos con esperas reales', async () => {
    let reads = 0;
    await rejectsRunner(
      runCrmCapture<Item>({
        binding: { ...B },
        entities: ['contacts'],
        getBinding: async () => ({ ...B }),
        deadlineMs: 70,
        maxAttempts: 10,
        baseDelayMs: 25,
        maxDelayMs: 25,
        readPage: async () => {
          reads += 1;
          throw new CaptureReadError(503);
        },
      }),
      'DEADLINE',
    );
    assert.ok(reads >= 1 && reads < 10);
  });

  it('no deja listeners ni lecturas activas tras terminar (exito o fallo)', async () => {
    const controller = new AbortController();
    await runCrmCapture<Item>(opts({ signal: controller.signal, readPage: async () => page(['1'], null) }));
    assert.equal(getEventListeners(controller.signal, 'abort').length, 0);

    await rejectsRunner(
      runCrmCapture<Item>(
        opts({
          signal: controller.signal,
          readPage: async () => {
            throw new CaptureReadError(401);
          },
        }),
      ),
      'READ_FAILED',
    );
    assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
    controller.abort(); // abortar despues no debe producir nada
  });

  it('el intento exitoso no deja su senal abortada', async () => {
    let seen: AbortSignal | undefined;
    await runCrmCapture<Item>(
      opts({
        readPage: async (request) => {
          seen = request.signal;
          return page(['1'], null);
        },
      }),
    );
    assert.equal(seen?.aborted, false);
  });

  it('consume un rechazo tardio de una lectura abandonada', async () => {
    const unhandled: unknown[] = [];
    const listener = (reason: unknown): void => void unhandled.push(reason);
    process.on('unhandledRejection', listener);
    try {
      await rejectsRunner(
        runCrmCapture<Item>(
          opts({
            requestTimeoutMs: 15,
            readPage: () =>
              new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error('tardio')), 50)),
          }),
        ),
        'TIMEOUT',
      );
      await wait(100);
      assert.deepEqual(unhandled, []);
    } finally {
      process.off('unhandledRejection', listener);
    }
  });

  it('no hace ninguna llamada despues de rechazar', async () => {
    let calls = 0;
    await rejectsRunner(
      runCrmCapture<Item>(
        opts({
          getBinding: async () => {
            calls += 1;
            return { ...B };
          },
          sleep: async () => {
            calls += 1;
          },
          readPage: async () => {
            calls += 1;
            throw new CaptureReadError(500);
          },
        }),
      ),
      'RETRY_EXHAUSTED',
    );
    const snapshot = calls;
    await wait(60);
    assert.equal(calls, snapshot);
  });
});

describe('runCrmCapture: paginas invalidas y contrato', () => {
  const malformed: Array<[string, unknown]> = [
    ['pagina null', null],
    ['pagina string', 'x'],
    ['items no array', { items: 'a', nextCursor: null }],
    ['items ausente', { nextCursor: null }],
    ['item null', { items: [null], nextCursor: null }],
    ['item numerico', { items: [1], nextCursor: null }],
    ['item array', { items: [[]], nextCursor: null }],
    ['item hueco', { items: new Array(1), nextCursor: null }],
    ['item sin id', { items: [{}], nextCursor: null }],
    ['id con espacios', { items: [{ id: ' a' }], nextCursor: null }],
    ['id vacio', { items: [{ id: '' }], nextCursor: null }],
    ['id numerico', { items: [{ id: 5 }], nextCursor: null }],
    ['nextCursor ausente', { items: [{ id: 'a' }] }],
    ['nextCursor vacio', { items: [{ id: 'a' }], nextCursor: '' }],
    ['total negativo', { items: [{ id: 'a' }], nextCursor: null, total: -1 }],
    ['total decimal', { items: [{ id: 'a' }], nextCursor: null, total: 1.5 }],
  ];
  for (const [name, bad] of malformed) {
    it(`rechaza toda la captura: ${name}`, async () => {
      let reads = 0;
      await rejectsContract(
        runCrmCapture<Item>(
          opts({
            readPage: async () => {
              reads += 1;
              return bad as never;
            },
          }),
        ),
        'INVALID_INPUT',
      );
      assert.equal(reads, 1);
    });
  }

  it('un getter hostil en la pagina es INVALID_INPUT', async () => {
    const hostile = {
      get items(): unknown[] {
        throw new Error('boom');
      },
      nextCursor: null,
    };
    await rejectsContract(runCrmCapture<Item>(opts({ readPage: async () => hostile as never })), 'INVALID_INPUT');
  });

  it('detecta bucle de cursores y no sigue leyendo', async () => {
    let reads = 0;
    await rejectsContract(
      runCrmCapture<Item>(
        opts({
          readPage: async (request) => {
            reads += 1;
            return request.cursor === null ? page(['1'], 'c1') : page(['2'], 'c1');
          },
        }),
      ),
      'CURSOR_LOOP',
    );
    assert.equal(reads, 2);
  });

  it('detecta duplicados dentro de la pagina y entre paginas de la misma entidad', async () => {
    await rejectsContract(
      runCrmCapture<Item>(opts({ readPage: async () => page(['1', '1'], null) })),
      'DUPLICATE_ID',
    );
    let reads = 0;
    await rejectsContract(
      runCrmCapture<Item>(
        opts({
          readPage: async (request) => {
            reads += 1;
            return request.cursor === null ? page(['1'], 'c2') : page(['1'], null);
          },
        }),
      ),
      'DUPLICATE_ID',
    );
    assert.equal(reads, 2);
  });

  it('pagina vacia con cursor, total cambiado y recuento incorrecto', async () => {
    await rejectsContract(runCrmCapture<Item>(opts({ readPage: async () => page([], 'c1') })), 'EMPTY_PAGE');
    await rejectsContract(
      runCrmCapture<Item>(
        opts({ readPage: async (request) => (request.cursor === null ? page(['1'], 'c2', 2) : page(['2'], null, 3)) }),
      ),
      'TOTAL_CHANGED',
    );
    await rejectsContract(
      runCrmCapture<Item>(opts({ readPage: async () => page(['1'], null, 2) })),
      'COUNT_MISMATCH',
    );
  });

  it('los limites de paginas y registros llegan al contrato', async () => {
    let reads = 0;
    await rejectsContract(
      runCrmCapture<Item>(
        opts({
          maxPages: 1,
          readPage: async (request) => {
            reads += 1;
            return request.cursor === null ? page(['1'], 'c2') : page(['2'], null);
          },
        }),
      ),
      'LIMIT_EXCEEDED',
    );
    assert.equal(reads, 2);
    await rejectsContract(
      runCrmCapture<Item>(opts({ maxRecords: 1, readPage: async () => page(['1', '2'], null) })),
      'LIMIT_EXCEEDED',
    );
  });

  it('no reintenta ni reutiliza paginas tras un error del contrato', async () => {
    let reads = 0;
    await rejectsContract(
      runCrmCapture<Item>(
        opts({
          readPage: async () => {
            reads += 1;
            return page([], 'c1');
          },
        }),
      ),
      'EMPTY_PAGE',
    );
    await wait(20);
    assert.equal(reads, 1);
  });
});

describe('runCrmCapture: inmutabilidad', () => {
  it('congela resultado, records y arrays; copia los items de forma superficial', async () => {
    const original: Item = { id: '1', name: 'a', meta: { n: 1 } };
    const result = await runCrmCapture<Item>(
      opts({ readPage: async () => ({ items: [original], nextCursor: null }) }),
    );
    assert.ok(Object.isFrozen(result));
    assert.ok(Object.isFrozen(result.records));
    assert.ok(Object.isFrozen(result.records.contacts));
    const stored = result.records.contacts?.[0] as Item;
    assert.ok(Object.isFrozen(stored));
    assert.notEqual(stored, original);
    assert.equal(stored.meta, original.meta); // payload anidado opaco: misma referencia, sin deep freeze
    assert.ok(!Object.isFrozen(original.meta));
    assertDeepFrozen(result.summary);

    original.name = 'mutado';
    assert.equal(stored.name, 'a');
    assert.throws(() => {
      (result as { attempts: number }).attempts = 9;
    }, TypeError);
    assert.throws(() => {
      (result.records as Record<string, unknown>).deals = [];
    }, TypeError);
    assert.throws(() => {
      (result.records.contacts as Item[]).push({ id: 'x' });
    }, TypeError);
    assert.throws(() => {
      stored.name = 'otro';
    }, TypeError);
  });

  it('lo que el transporte mute despues de responder no altera lo almacenado', async () => {
    const items: Item[] = [{ id: '1' }];
    const result = await runCrmCapture<Item>(
      opts({
        readPage: async () => {
          const response: RunnerPage<Item> = { items, nextCursor: null };
          setTimeout(() => items.push({ id: 'tardio' }), 0);
          return response;
        },
      }),
    );
    await wait(10);
    assert.deepEqual(result.records.contacts?.map((i) => i.id), ['1']);
  });
});

describe('runCrmCapture: opciones', () => {
  const read = async (): Promise<RunnerPage<Item>> => page(['1'], null);
  const get = async (): Promise<CaptureBinding> => ({ ...B });
  const ok = { binding: { ...B }, entities: ['contacts'] as Entity[], readPage: read, getBinding: get };

  const invalid: Array<[string, unknown]> = [
    ['opciones null', null],
    ['binding null', { ...ok, binding: null }],
    ['tenantId con espacios', { ...ok, binding: { ...B, tenantId: ' x' } }],
    ['generation negativa', { ...ok, binding: { ...B, generation: -1 } }],
    ['entities no array', { ...ok, entities: 'contacts' }],
    ['entities vacio', { ...ok, entities: [] }],
    ['entities duplicadas', { ...ok, entities: ['contacts', 'contacts'] }],
    ['entidad desconocida', { ...ok, entities: ['notes'] }],
    ['readPage ausente', { ...ok, readPage: undefined }],
    ['getBinding no funcion', { ...ok, getBinding: 'x' }],
    ['sleep no funcion', { ...ok, sleep: 5 }],
    ['signal falsa', { ...ok, signal: {} }],
    ['signal null', { ...ok, signal: null }],
    ['maxAttempts 0', { ...ok, maxAttempts: 0 }],
    ['maxAttempts 11', { ...ok, maxAttempts: 11 }],
    ['maxAttempts decimal', { ...ok, maxAttempts: 2.5 }],
    ['requestTimeoutMs 0', { ...ok, requestTimeoutMs: 0 }],
    ['requestTimeoutMs NaN', { ...ok, requestTimeoutMs: Number.NaN }],
    ['deadlineMs negativo', { ...ok, deadlineMs: -1 }],
    ['deadlineMs no seguro', { ...ok, deadlineMs: 2 ** 60 }],
    ['baseDelayMs negativo', { ...ok, baseDelayMs: -1 }],
    ['maxDelayMs decimal', { ...ok, maxDelayMs: 1.5 }],
    ['maxDelay menor que base', { ...ok, baseDelayMs: 500, maxDelayMs: 100 }],
    ['base por encima del maxDelay por defecto', { ...ok, baseDelayMs: 20_000 }],
    ['maxPages 0', { ...ok, maxPages: 0 }],
    ['maxRecords decimal', { ...ok, maxRecords: 0.5 }],
  ];
  for (const [name, options] of invalid) {
    it(`INVALID_OPTIONS: ${name}`, async () => {
      await rejectsRunner(runCrmCapture(options as never), 'INVALID_OPTIONS');
    });
  }

  it('INVALID_OPTIONS: getter hostil en las opciones', async () => {
    const hostile = {
      ...ok,
      get maxAttempts(): number {
        throw new Error('boom');
      },
    };
    await rejectsRunner(runCrmCapture(hostile as never), 'INVALID_OPTIONS');
  });

  it('acepta los limites de borde y valores undefined explicitos', async () => {
    const result = await runCrmCapture<Item>({
      ...ok,
      maxAttempts: 10,
      requestTimeoutMs: 1,
      deadlineMs: 5000,
      baseDelayMs: 0,
      maxDelayMs: 0,
      maxPages: undefined,
      maxRecords: undefined,
      signal: undefined,
      sleep: undefined,
    });
    assert.equal(result.summary.totalRecords, 1);
  });

  it('CaptureReadError conserva status y retryAfterMs sin exponerlos en el mensaje', () => {
    const error = new CaptureReadError(429, 1500);
    assert.ok(error instanceof Error);
    assert.equal(error.status, 429);
    assert.equal(error.retryAfterMs, 1500);
    assert.equal(new CaptureReadError(500).retryAfterMs, undefined);
    assert.ok(!error.message.includes('1500'));
  });
});

describe('runCrmCapture: cupos antes de copiar', () => {
  // Items con getter enumerable: si el motor los clona, el contador sube.
  function trapped(ids: string[], counter: { reads: number }): Item[] {
    return ids.map((id) => {
      const item = { id } as Item & { label?: string };
      Object.defineProperty(item, 'label', {
        enumerable: true,
        get() {
          counter.reads += 1;
          return `l-${id}`;
        },
      });
      return item;
    });
  }

  it('pagina inicial sobredimensionada: LIMIT_EXCEEDED sin ejecutar ningun getter', async () => {
    const counter = { reads: 0 };
    let calls = 0;
    await rejectsContract(
      runCrmCapture<Item>(
        opts({
          maxRecords: 1,
          readPage: async () => {
            calls += 1;
            return { items: trapped(['1', '2', '3', '4'], counter), nextCursor: null };
          },
        }),
      ),
      'LIMIT_EXCEEDED',
    );
    assert.equal(counter.reads, 0);
    assert.equal(calls, 1);
  });

  it('el cupo es GLOBAL: exceso tras una entidad aceptada, sin resultado parcial', async () => {
    const counter = { reads: 0 };
    const requests: string[] = [];
    let result: unknown;
    await rejectsContract(
      (async () => {
        result = await runCrmCapture<Item>(
          opts({
            entities: ['contacts', 'companies', 'deals'],
            maxRecords: 3,
            readPage: async (request) => {
              requests.push(request.entity);
              if (request.entity === 'contacts') return page(['1', '2'], null);
              return { items: trapped(['a', 'b'], counter), nextCursor: null };
            },
          }),
        );
      })(),
      'LIMIT_EXCEEDED',
    );
    assert.equal(result, undefined);
    assert.equal(counter.reads, 0);
    assert.deepEqual(requests, ['contacts', 'companies']); // deals nunca se lee
  });

  it('el cupo acumula entre paginas de la misma entidad', async () => {
    const counter = { reads: 0 };
    await rejectsContract(
      runCrmCapture<Item>(
        opts({
          maxRecords: 3,
          readPage: async (request) =>
            request.cursor === null
              ? page(['1', '2'], 'c2')
              : { items: trapped(['3', '4'], counter), nextCursor: null },
        }),
      ),
      'LIMIT_EXCEEDED',
    );
    assert.equal(counter.reads, 0);
  });

  it('los limites exactos se aceptan y entonces los items si se copian', async () => {
    const counter = { reads: 0 };
    const result = await runCrmCapture<Item>(
      opts({
        entities: ['contacts', 'companies'],
        maxRecords: 3,
        maxPages: 3,
        readPage: async (request) => {
          if (request.entity === 'companies') return { items: trapped(['x'], counter), nextCursor: null };
          return request.cursor === null ? page(['1'], 'c2') : page(['2'], null);
        },
      }),
    );
    assert.equal(result.summary.totalRecords, 3);
    assert.equal(result.summary.totalPages, 3);
    assert.equal(counter.reads, 1); // el getter se evalua una vez al copiar el item permitido
  });

  it('maxPages: no se clona una pagina adicional (misma entidad y entre entidades)', async () => {
    const counter = { reads: 0 };
    let reads = 0;
    await rejectsContract(
      runCrmCapture<Item>(
        opts({
          maxPages: 1,
          readPage: async (request) => {
            reads += 1;
            return request.cursor === null
              ? page(['1'], 'c2')
              : { items: trapped(['2'], counter), nextCursor: null };
          },
        }),
      ),
      'LIMIT_EXCEEDED',
    );
    assert.equal(counter.reads, 0);
    assert.equal(reads, 2);

    await rejectsContract(
      runCrmCapture<Item>(
        opts({
          entities: ['contacts', 'deals'],
          maxPages: 1,
          readPage: async (request) =>
            request.entity === 'contacts' ? page(['1'], null) : { items: trapped(['9'], counter), nextCursor: null },
        }),
      ),
      'LIMIT_EXCEEDED',
    );
    assert.equal(counter.reads, 0);
  });

  it('los reintentos de transporte no consumen cupo', async () => {
    const { requests, readPage } = flaky(
      [new CaptureReadError(503), new CaptureReadError(429)],
      page(['1', '2'], null),
    );
    const result = await runCrmCapture<Item>(opts({ readPage, maxRecords: 2, maxPages: 1 }));
    assert.equal(requests.length, 3);
    assert.equal(result.summary.totalRecords, 2);
    assert.equal(result.attempts, 3);
  });

  it('defaults del contrato: 1000 paginas y 1.000.000 registros', async () => {
    const counter = { reads: 0 };
    let reads = 0;
    await rejectsContract(
      runCrmCapture<Item>(
        opts({
          readPage: async (request) => {
            reads += 1;
            const n = request.cursor === null ? 0 : Number(request.cursor);
            if (n < 1000) return page([`id-${n}`], String(n + 1));
            return { items: trapped(['ultima'], counter), nextCursor: null };
          },
        }),
      ),
      'LIMIT_EXCEEDED',
    );
    assert.equal(reads, 1001);
    assert.equal(counter.reads, 0);

    // Un array "enorme" y disperso se rechaza por longitud, antes de tocar ningun hueco.
    await rejectsContract(
      runCrmCapture<Item>(
        opts({ readPage: async () => ({ items: new Array(1_000_001), nextCursor: null }) as never }),
      ),
      'LIMIT_EXCEEDED',
    );
  });

  it('el cambio de identidad sigue teniendo prioridad sobre el exceso de cupo', async () => {
    let calls = 0;
    await rejectsRunner(
      runCrmCapture<Item>(
        opts({
          maxRecords: 1,
          getBinding: async () => {
            calls += 1;
            return calls >= 2 ? { ...B, portalId: 'portal-2' } : { ...B };
          },
          readPage: async () => page(['1', '2'], null),
        }),
      ),
      'BINDING_CHANGED',
    );
  });

  it('tras un rechazo por cupo no hay mas llamadas ni resultado', async () => {
    let calls = 0;
    await rejectsContract(
      runCrmCapture<Item>(
        opts({
          maxRecords: 1,
          getBinding: async () => {
            calls += 1;
            return { ...B };
          },
          readPage: async () => {
            calls += 1;
            return page(['1', '2'], null);
          },
        }),
      ),
      'LIMIT_EXCEEDED',
    );
    const snapshot = calls;
    await wait(40);
    assert.equal(calls, snapshot);
  });
});
