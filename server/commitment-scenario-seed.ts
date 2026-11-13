import { createHash } from 'node:crypto';
import { z } from 'zod';
import { createMultisystemScenario } from '../shared/commitment-multisystem-demo.js';
import type { CommitmentDataset } from '../shared/commitments.js';
import type { Store } from './store.js';
import { workspaceSearchIdentity } from './workspace-search.js';

/** Internal installer metadata, never a browser-selected path or source account. */
export const COMMITMENT_SCENARIO_SEED_KEY = 'commitment-scenario:multisystem:v1';
const MISSING = Symbol('missing-commitment-scenario-seed');
const markerSchema = z.object({
  format: z.literal('planb-commitment-scenario-seed-v1'),
  scenario: z.literal('multisystem-v1'),
  instanceId: z.string().uuid(),
  seedAt: z.iso.datetime(),
  datasetRevision: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export type ScenarioSeedResult =
  | { status: 'ready'; dataset: CommitmentDataset; seedAt: string; datasetRevision: string;
      provenance: 'durable' | 'memory-only'; created: boolean }
  | { status: 'unavailable'; reason: 'inactive-copy' | 'not-fiction' | 'missing-identity'
      | 'not-initialized' | 'invalid-marker' | 'storage-failed' | 'invalid-clock' | 'context-changed' };

const unavailable = (reason: Extract<ScenarioSeedResult, {status:'unavailable'}>['reason']): ScenarioSeedResult => ({status:'unavailable',reason});
const revision = (dataset: CommitmentDataset) => createHash('sha256')
  .update(JSON.stringify({commitments:dataset.commitments,observations:dataset.observations})).digest('hex');

function context(store: Store): {instanceId: string; revision: string} | ScenarioSeedResult {
  if (!store.ready) return unavailable('inactive-copy');
  const identity = workspaceSearchIdentity(store);
  if (!identity) return unavailable('missing-identity');
  if (!identity.isTestData) return unavailable('not-fiction');
  return {instanceId:identity.instanceId,revision:identity.contextRevision};
}

function fromMarker(store: Store, instanceId: string, raw: unknown): ScenarioSeedResult {
  const parsed = markerSchema.safeParse(raw);
  if (!parsed.success || parsed.data.instanceId !== instanceId) return unavailable('invalid-marker');
  const epoch = Date.parse(parsed.data.seedAt);
  if (!Number.isSafeInteger(epoch) || epoch <= 0) return unavailable('invalid-marker');
  let dataset: CommitmentDataset;
  try { dataset = createMultisystemScenario(epoch); } catch { return unavailable('invalid-marker'); }
  // A changed generator is a different scenario, even if its name stayed the same.
  if (revision(dataset) !== parsed.data.datasetRevision) return unavailable('invalid-marker');
  return {status:'ready',dataset,seedAt:parsed.data.seedAt,datasetRevision:parsed.data.datasetRevision,
    provenance:store.filename === ':memory:' ? 'memory-only' : 'durable',created:false};
}

/** Pure Store read: absence/corruption never creates, refreshes, repairs or prunes a seed. */
export function readCommitmentScenarioSeed(store: Store): ScenarioSeedResult {
  try {
    const active = context(store);
    if ('status' in active) return active;
    const raw = store.get<unknown>(COMMITMENT_SCENARIO_SEED_KEY, MISSING);
    return raw === MISSING ? unavailable('not-initialized') : fromMarker(store,active.instanceId,raw);
  } catch { return unavailable('storage-failed'); }
}

/**
 * Explicit local installation/activation step, NOT a GET handler. The first seed
 * is committed under Store's synchronous transaction; subsequent calls only read
 * it. The live Radar clock remains Date.now, not this fixed seed's epoch.
 * Existing invalid metadata is preserved, never silently replaced with new dates.
 */
export function initializeCommitmentScenarioSeed(store: Store, clock: () => number = Date.now): ScenarioSeedResult {
  try {
    return store.transaction((): ScenarioSeedResult => {
      const active = context(store);
      if ('status' in active) return active;
      const raw = store.get<unknown>(COMMITMENT_SCENARIO_SEED_KEY, MISSING);
      if (raw !== MISSING) return fromMarker(store,active.instanceId,raw);
      let epoch: number, dataset: CommitmentDataset, seedAt: string;
      try {
        epoch = clock();
        if (!Number.isSafeInteger(epoch) || epoch <= 0) return unavailable('invalid-clock');
        seedAt = new Date(epoch).toISOString();
        dataset = createMultisystemScenario(epoch);
      } catch { return unavailable('invalid-clock'); }
      const latest = context(store);
      if ('status' in latest || latest.instanceId !== active.instanceId || latest.revision !== active.revision) return unavailable('context-changed');
      const marker = markerSchema.parse({format:'planb-commitment-scenario-seed-v1',scenario:'multisystem-v1',
        instanceId:active.instanceId,seedAt,datasetRevision:revision(dataset)});
      store.set(COMMITMENT_SCENARIO_SEED_KEY,marker);
      // Transaction commit must succeed before this result reaches the caller.
      return {status:'ready',dataset,seedAt,datasetRevision:marker.datasetRevision,
        provenance:store.filename === ':memory:' ? 'memory-only' : 'durable',created:true};
    });
  } catch { return unavailable('storage-failed'); }
}
