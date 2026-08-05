/**
 * Ranking + safeguards. Turns an ordered list of graph nodes into a bounded,
 * ranked `RankedContext`:
 *   - collapse many nodes → unique files (a file is more relevant the earlier and
 *     the more often it appears in the traversal, and if its name matches the topic);
 *   - split into buckets and cap each bucket to its configured limit;
 *   - enforce a global byte budget on read-files (source + doc + adr), shedding the
 *     lowest-ranked source files first and recording a warning.
 */
import { statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { categorize, referenceName } from './classify.ts';
import type {
  Category,
  GraphNode,
  RankedContext,
  Reference,
  RouterConfig,
  ScoredFile,
} from './types.ts';

interface Agg {
  firstIndex: number;
  hits: number;
}

function sizeOf(root: string, relPath: string): number {
  try {
    return statSync(join(root, relPath)).size;
  } catch {
    return 0;
  }
}

/**
 * Composite relevance score. Token-name matches dominate, then hit count, then
 * traversal proximity (earlier = better). Kept as a single monotonic number so
 * sorting is stable and easy to reason about.
 */
function scoreOf(path: string, agg: Agg, tokens: string[]): number {
  const name = basename(path).toLowerCase();
  const nameBoost = tokens.some((t) => name.includes(t)) ? 100_000 : 0;
  return nameBoost + agg.hits * 1_000 - agg.firstIndex;
}

export function rankContext(
  nodes: GraphNode[],
  tokens: string[],
  config: RouterConfig,
): RankedContext {
  const root = config.projectRoot;
  const { limits } = config;

  // Collapse nodes → unique files, remembering earliest index and hit count.
  const agg = new Map<string, Agg>();
  nodes.forEach((node, i) => {
    if (!node.src) return;
    const cur = agg.get(node.src);
    if (cur) cur.hits += 1;
    else agg.set(node.src, { firstIndex: i, hits: 1 });
  });

  const scored: ScoredFile[] = [];
  const refs: Record<'skill' | 'agent' | 'command', Reference[]> = {
    skill: [],
    agent: [],
    command: [],
  };

  for (const [path, a] of agg) {
    const category = categorize(path);
    const score = scoreOf(path, a, tokens);
    if (category === 'skill' || category === 'agent' || category === 'command') {
      refs[category].push({ name: referenceName(category, path), path, score });
    } else {
      scored.push({
        path,
        category,
        score,
        firstIndex: a.firstIndex,
        hits: a.hits,
        sizeBytes: sizeOf(root, path),
      });
    }
  }

  const byScore = <T extends { score: number }>(a: T, b: T) => b.score - a.score;
  const dedupeRefs = (list: Reference[]): Reference[] => {
    const seen = new Map<string, Reference>();
    for (const r of list.sort(byScore)) if (!seen.has(r.name)) seen.set(r.name, r);
    return [...seen.values()];
  };

  const bucket = (cat: Category): ScoredFile[] =>
    scored.filter((f) => f.category === cat).sort(byScore);

  const warnings: string[] = [];
  const cap = <T>(list: T[], max: number, label: string): T[] => {
    if (list.length > max) {
      warnings.push(`${label}: kept top ${max} of ${list.length} matches (relevance-ranked).`);
      return list.slice(0, max);
    }
    return list;
  };

  const source = cap(bucket('source'), limits.maxSourceFiles, 'source files');
  const docs = cap(bucket('doc'), limits.maxDocs, 'docs');
  const adrs = cap(bucket('adr'), limits.maxAdrs, 'ADRs');
  const skills = cap(dedupeRefs(refs.skill), limits.maxSkills, 'skills');
  const agents = cap(dedupeRefs(refs.agent), limits.maxAgents, 'agents');
  const commands = cap(dedupeRefs(refs.command), limits.maxCommands, 'commands');

  // Global byte budget over read-files: shed lowest-ranked source first.
  const readBytes = () => [...source, ...docs, ...adrs].reduce((n, f) => n + f.sizeBytes, 0);
  if (readBytes() > limits.maxContextBytes) {
    const before = source.length;
    while (readBytes() > limits.maxContextBytes && source.length > 1) source.pop();
    if (source.length < before) {
      warnings.push(
        `context exceeded ${(limits.maxContextBytes / 1024).toFixed(0)} KB budget: trimmed source files ${before} → ${source.length}.`,
      );
    }
    if (readBytes() > limits.maxContextBytes) {
      warnings.push(
        `⚠ selected context (~${(readBytes() / 1024).toFixed(0)} KB) still exceeds the ${(limits.maxContextBytes / 1024).toFixed(0)} KB budget after trimming — consider narrowing the request.`,
      );
    }
  }

  const readFiles = [...source, ...docs, ...adrs];
  return {
    source,
    docs,
    adrs,
    skills,
    agents,
    commands,
    warnings,
    totalFiles: readFiles.length,
    totalBytes: readFiles.reduce((n, f) => n + f.sizeBytes, 0),
  };
}
