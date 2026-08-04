/**
 * Graphify CLI adapter. Runs `graphify query "<topic>" --budget N` and parses the
 * `NODE <name> [src=<path> loc=<Lnn> community=<...>]` lines from its output.
 *
 * Graphify prints a version-mismatch warning to stderr; we read stdout only and
 * ignore stderr. On timeout or non-zero exit we still parse whatever partial
 * stdout we captured — a smaller subgraph is better than none.
 */
import { execFileSync } from 'node:child_process';
import type { GraphNode, RouterConfig } from './types.ts';
import type { Logger } from './logger.ts';

const NODE_RE = /^NODE\s+(.+?)\s+\[src=(.+?)\s+loc=(L\d+)\s+community=(.+)\]\s*$/;
const COUNT_RE = /(\d+)\s+nodes found/i;

export interface GraphifyResult {
  ok: boolean;
  nodes: GraphNode[];
  nodesFound: number;
}

function parse(stdout: string): GraphifyResult {
  const nodes: GraphNode[] = [];
  let nodesFound = 0;

  for (const line of stdout.split('\n')) {
    const countMatch = line.match(COUNT_RE);
    if (countMatch && nodesFound === 0) nodesFound = Number(countMatch[1]);

    const m = line.match(NODE_RE);
    if (m) {
      nodes.push({ name: m[1].trim(), src: m[2].trim(), loc: m[3].trim(), community: m[4].trim() });
    }
  }

  return { ok: nodes.length > 0, nodes, nodesFound: nodesFound || nodes.length };
}

/** Run a Graphify query for `topic`. Never throws. */
export function runGraphifyQuery(
  topic: string,
  config: RouterConfig,
  logger: Logger,
): GraphifyResult {
  const args = ['query', topic, '--budget', String(config.limits.graphifyBudget)];
  // Point at an explicit graph only when it differs from graphify's default,
  // to stay compatible with older CLI versions that lack the flag.
  logger.debug(`graphify ${args.map((a) => (a.includes(' ') ? JSON.stringify(a) : a)).join(' ')}`);

  try {
    const stdout = execFileSync(config.graphifyCommand, args, {
      cwd: config.projectRoot,
      encoding: 'utf8',
      timeout: config.queryTimeoutMs,
      maxBuffer: 8 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return parse(stdout);
  } catch (err) {
    // execFileSync throws on non-zero exit AND on timeout, but partial stdout may
    // still be attached — salvage it.
    const e = err as {
      stdout?: Buffer | string;
      killed?: boolean;
      code?: string;
      message?: string;
    };
    const stdout = e.stdout ? e.stdout.toString() : '';
    if (stdout) {
      const result = parse(stdout);
      if (result.nodes.length > 0) {
        logger.warn(
          `graphify exited non-cleanly (${e.killed ? 'timeout' : (e.code ?? 'error')}); using partial output`,
        );
        return result;
      }
    }
    logger.warn(`graphify query failed: ${e.message ?? 'unknown error'}`);
    return { ok: false, nodes: [], nodesFound: 0 };
  }
}
