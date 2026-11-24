import type { WatchReport } from './watch.js';

export const WATCH_RESOURCE = '/api/verifica/engagements/:id/watch';
export const WATCH_ARTIFACTS = WATCH_RESOURCE + '/artifacts/:file';
export const watchUrl = (id: string) => WATCH_RESOURCE.replace(':id', encodeURIComponent(id));

export interface WatchCaptureRef { at: string; fingerprint: string }

export interface WatchScheduleStatus {
  active: boolean;
  signing: WatchCaptureRef;
  latest: WatchCaptureRef;
  weeklyCount: number;
  nextDue: string;
  late: boolean;
  retriesAfter: string | null;
}

export interface WatchSigningChoice extends WatchCaptureRef { role: 'previous' | 'latest' }

export type WatchView = { name: string } & (
  { schedule: null; choices: WatchSigningChoice[] } | { schedule: WatchScheduleStatus; choices?: never }
);

export type WatchAction =
  | { action: 'set-signing'; role: WatchSigningChoice['role']; fingerprint: string; salt?: string }
  | { action: 'resume'; token: string; authorization: string; documentBase64: string; confirmRecurring: boolean }
  | { action: 'pause' }
  | { action: 'accept'; fingerprint: string; confirmed: boolean };

export type WatchArtifact = 'report' | 'salt';
export type WatchReportResult = { report: WatchReport };
