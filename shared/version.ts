import manifest from '../package.json' with { type: 'json' };
export const APP_VERSION=manifest.version;
export const RELEASE_TAG='v'+APP_VERSION;
export const GENERATOR_ZIP='Plan-B-CRM-'+RELEASE_TAG+'.zip';
export const RUNTIME_ZIP='Plan-B-independiente-'+RELEASE_TAG+'.zip';
