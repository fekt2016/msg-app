/**
 * Fallbacks for when Graphify returns nothing. The escalation is:
 *   Graphify → semantic (ripgrep content search) → filesystem (filename match).
 * Every stage is scoped to `fallback.searchGlobs` and hard-capped, so we never
 * enumerate the whole repository.
 *
 * Each stage returns pseudo-`GraphNode`s so the caller can feed them through the
 * exact same ranking pipeline as real Graphify results.
 */
import { execFileSync } from 'node:child_process';
import type { GraphNode, RouterConfig } from './types.ts';
import type { Logger } from './logger.ts';

const MAX_FALLBACK_FILES = 60; // hard ceiling before ranking trims further

function run(cmd: string, args: string[], cwd: string): string {
  try {
    return execFileSync(cmd, args, {
      cwd,
      encoding: 'utf8',
      timeout: 6000,
      maxBuffer: 8 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (err) {
    const e = err as { stdout?: Buffer | string };
    return e.stdout ? e.stdout.toString() : '';
  }
}

function hasRipgrep(cwd: string): boolean {
  try {
    execFileSync('rg', ['--version'], { cwd, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function toNodes(paths: string[], community: string): GraphNode[] {
  const seen = new Set<string>();
  const nodes: GraphNode[] = [];
  for (const p of paths) {
    const rel = p.trim();
    if (!rel || seen.has(rel)) continue;
    seen.add(rel);
    nodes.push({ name: rel, src: rel, loc: 'L1', community });
    if (nodes.length >= MAX_FALLBACK_FILES) break;
  }
  return nodes;
}

/** Content search: files that mention the topic tokens, ordered by ripgrep. */
export function semanticFallback(
  tokens: string[],
  config: RouterConfig,
  logger: Logger,
): GraphNode[] {
  if (!config.fallback.semantic || tokens.length === 0) return [];
  const roots = config.fallback.searchGlobs;
  const patternArgs = tokens.flatMap((t) => ['-e', t]);

  let out = '';
  if (hasRipgrep(config.projectRoot)) {
    out = run('rg', ['-l', '-i', '--max-count', '1', ...patternArgs, ...roots], config.projectRoot);
  } else {
    // POSIX grep fallback (extended, files-with-matches, recursive).
    const alt = tokens.map((t) => t.replace(/[.[\]*^$()+?{}|\\]/g, '\\$&')).join('|');
    out = run('grep', ['-rlEi', '--', alt, ...roots], config.projectRoot);
  }

  const files = out.split('\n').filter(Boolean);
  logger.info(`semantic fallback: ${files.length} file(s) matched [${tokens.join(', ')}]`);
  return toNodes(files, 'semantic-fallback');
}

/** Filename search: files whose *path* contains a topic token. */
export function filesystemFallback(
  tokens: string[],
  config: RouterConfig,
  logger: Logger,
): GraphNode[] {
  if (!config.fallback.filesystem || tokens.length === 0) return [];
  const roots = config.fallback.searchGlobs;

  let listing = '';
  if (hasRipgrep(config.projectRoot)) {
    listing = run('rg', ['--files', ...roots], config.projectRoot);
  } else {
    listing = run('find', [...roots, '-type', 'f'], config.projectRoot);
  }

  const files = listing
    .split('\n')
    .filter(Boolean)
    .filter((p) => {
      const lower = p.toLowerCase();
      return tokens.some((t) => lower.includes(t));
    });

  logger.info(`filesystem fallback: ${files.length} file(s) matched filename tokens`);
  return toNodes(files, 'filesystem-fallback');
}
