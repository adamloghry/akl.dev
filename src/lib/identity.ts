// identity.ts — build-time view of src/data/identity.json, which scripts/verify-identity.mjs writes
// before every build (npm prebuild). `identity` is null while the key is not yet published
// ({"pending": true}), and also when the file is absent (astro dev / astro check without a build).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Identity {
  pending: false;
  fingerprint: string;
  fingerprintGrouped: string;
  /** The address for encrypted mail: the first `Email:` of the manifest. */
  email: string;
  /** Every address on the key. `wkd` is true for the ones this site serves a WKD file for (its own domain). */
  addresses: { address: string; wkd: boolean }[];
  created: string;
  primaryExpires: string | null;
  subkeys: { keyId: string; algorithm: string; expires: string | null }[];
  allowedSigners: boolean;
  manifest: { issued: string | null; expires: string | null; fields: Record<string, string[]> };
}

function load(): Identity | null {
  try {
    const data = JSON.parse(readFileSync(join(process.cwd(), 'src', 'data', 'identity.json'), 'utf8'));
    return data.pending === false ? (data as Identity) : null;
  } catch {
    return null;
  }
}

export const identity = load();
/** Last 16 hex characters of the fingerprint (the long key ID), grouped in fours. */
export const shortFingerprint = identity ? identity.fingerprintGrouped.split(' ').slice(-4).join(' ') : null;
