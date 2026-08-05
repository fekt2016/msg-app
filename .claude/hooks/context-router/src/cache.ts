/**
 * Feature-level cache. A lookup for the same feature reuses the previous Graphify
 * routing until the graph changes.
 *
 * The cache key is a normalized feature name (so "authentication", "Auth flow",
 * and "login/OTP" collapse onto the same well-known domain). Each entry is stamped
 * with a graph *fingerprint*; the entry is invalid the moment the fingerprint
 * changes. The fingerprint is derived from signals that move exactly when the graph
 * or the code moves:
 *   - `git rev-parse HEAD`      → changes on commit / checkout
 *   - graph.json mtime + size   → changes when `graphify update .` rewrites the graph
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RankedContext, RouterConfig, RoutingResult } from './types.ts';
import type { Logger } from './logger.ts';

/** Canonical domains — normalizing onto these maximizes cache reuse. */
const DOMAIN_ALIASES: Array<{ domain: string; patterns: RegExp[] }> = [
  {
    domain: 'authentication',
    patterns: [/\b(auth|login|logout|register|otp|jwt|refresh token|rbac|session)\b/i],
  },
  {
    domain: 'e2ee',
    patterns: [/\b(e2ee|encryption|signal|sender[- ]?key|recovery key|ciphertext)\b/i],
  },
  { domain: 'realtime', patterns: [/\b(realtime|socket|socket\.io|presence|websocket|live)\b/i] },
  {
    domain: 'marketplace',
    patterns: [/\b(marketplace|product|catalog|inventory|order|cart|checkout|paystack|payment)\b/i],
  },
  { domain: 'communities', patterns: [/\b(community|communities|channel|story|stories)\b/i] },
];

/** Reduce a feature/topic to a stable cache key. */
export function normalizeFeature(topic: string): string {
  for (const { domain, patterns } of DOMAIN_ALIASES) {
    if (patterns.some((re) => re.test(topic))) return domain;
  }
  const slug = topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'misc';
}

function gitHead(root: string): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'no-git';
  }
}

/** A string that changes exactly when the graph or committed code changes. */
export function graphFingerprint(config: RouterConfig): string {
  let graphStamp = 'no-graph';
  try {
    const s = statSync(config.graphPath);
    graphStamp = `${Math.round(s.mtimeMs)}:${s.size}`;
  } catch {
    /* graph missing — fingerprint still varies by HEAD */
  }
  return `${gitHead(config.projectRoot)}::${graphStamp}`;
}

interface CacheEntry {
  fingerprint: string;
  feature: string;
  topic: string;
  savedAt: number;
  result: RoutingResult;
}

function cachePath(config: RouterConfig, key: string): string {
  return join(config.cache.dir, `${key}.json`);
}

/** Return a cached routing result if one is present, current, and unexpired. */
export function readCache(
  config: RouterConfig,
  feature: string,
  fingerprint: string,
  logger: Logger,
): RoutingResult | null {
  if (!config.cache.enabled) return null;
  try {
    const entry = JSON.parse(readFileSync(cachePath(config, feature), 'utf8')) as CacheEntry;
    if (entry.fingerprint !== fingerprint) {
      logger.debug(`cache stale for "${feature}" (graph/HEAD changed)`);
      return null;
    }
    const ageSec = (Date.now() - entry.savedAt) / 1000;
    if (config.cache.ttlSeconds > 0 && ageSec > config.cache.ttlSeconds) {
      logger.debug(`cache expired for "${feature}" (age ${Math.round(ageSec)}s)`);
      return null;
    }
    logger.info(`cache HIT for "${feature}" (age ${Math.round(ageSec)}s)`);
    return { ...entry.result, fromCache: true, source: 'cache' };
  } catch {
    return null;
  }
}

export function writeCache(
  config: RouterConfig,
  feature: string,
  topic: string,
  fingerprint: string,
  result: RoutingResult,
  logger: Logger,
): void {
  if (!config.cache.enabled) return;
  const entry: CacheEntry = { fingerprint, feature, topic, savedAt: Date.now(), result };
  try {
    mkdirSync(config.cache.dir, { recursive: true });
    writeFileSync(cachePath(config, feature), JSON.stringify(entry, null, 2));
    logger.debug(`cache WRITE for "${feature}"`);
  } catch (err) {
    logger.warn(`cache write failed: ${(err as Error).message}`);
  }
}

/** Re-hydrate a `RankedContext` from cache (identity helper; kept for clarity/extension). */
export function fromCachedRanked(ranked: RankedContext): RankedContext {
  return ranked;
}
