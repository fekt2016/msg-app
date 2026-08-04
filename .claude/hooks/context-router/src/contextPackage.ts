/**
 * Rendering. Two outputs from one `RoutingResult`:
 *   - `renderInjectedContext` → the text added to the model's context (stdout).
 *   - `renderLogBlock`        → the human `[Context Router]` summary for logs/stderr.
 */
import type { RoutingResult } from './types.ts';

function kb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

const SOURCE_LABEL: Record<RoutingResult['source'], string> = {
  graphify: 'graphify graph',
  cache: 'cache (previous graphify lookup)',
  'semantic-fallback': 'semantic content search (graphify miss)',
  'filesystem-fallback': 'filename search (graphify miss)',
  none: 'no matches',
};

/** The block injected into Claude's context. Terse, actionable, bounded. */
export function renderInjectedContext(result: RoutingResult): string {
  const { ranked, feature } = result;
  const lines: string[] = [];

  lines.push('<context-router>');
  lines.push(
    'Minimal task context selected by the Context Router. START HERE — do NOT scan the ' +
      'whole repository. Only widen beyond this set if these files prove insufficient, ' +
      'and widen with `graphify query "<narrower topic>"`, not a full-repo read.',
  );
  lines.push('');
  lines.push(`Feature: ${feature}`);
  lines.push(`Resolved via: ${SOURCE_LABEL[result.source]}${result.fromCache ? ' [cached]' : ''}`);

  if (ranked.source.length) {
    lines.push('');
    lines.push('Source files (read these first):');
    for (const f of ranked.source) lines.push(`  - ${f.path}`);
  }
  if (ranked.docs.length) {
    lines.push('');
    lines.push('Documentation:');
    for (const f of ranked.docs) lines.push(`  - ${f.path}`);
  }
  if (ranked.adrs.length) {
    lines.push('');
    lines.push('Architecture Decision Records:');
    for (const f of ranked.adrs) lines.push(`  - ${f.path}`);
  }
  if (ranked.skills.length) {
    lines.push('');
    lines.push(`Skills to invoke: ${ranked.skills.map((s) => `/${s.name}`).join(', ')}`);
  }
  if (ranked.agents.length) {
    lines.push(`Agents to consider: ${ranked.agents.map((a) => a.name).join(', ')}`);
  }
  if (ranked.commands.length) {
    lines.push(`Related commands: ${ranked.commands.map((c) => c.name).join(', ')}`);
  }

  lines.push('');
  lines.push(
    'Engineering rules: CLAUDE.md — §4 Coding Standards, §5 Architecture (layering), ' +
      '§8 API Conventions, §11 Security. Follow the skills above for domain specifics.',
  );

  lines.push('');
  lines.push(
    `Estimated context: ${ranked.totalFiles} file(s), ${kb(ranked.totalBytes)} ` +
      `(vs a full-repo read).`,
  );
  for (const w of ranked.warnings) lines.push(`  ⚠ ${w}`);
  lines.push('</context-router>');

  return lines.join('\n');
}

/** The `[Context Router]` summary for logs / stderr (mirrors requirement #9). */
export function renderLogBlock(result: RoutingResult): string {
  const { ranked } = result;
  const list = (label: string, items: string[]): string =>
    items.length ? `${label}:\n${items.map((i) => `  ${i}`).join('\n')}` : '';

  return [
    '[Context Router]',
    '',
    `Feature: ${result.feature}`,
    `Graphify Query: ${result.query}`,
    `Resolved Via: ${SOURCE_LABEL[result.source]}${result.fromCache ? ' [cached]' : ''}`,
    `Graph Nodes Matched: ${result.nodesFound}`,
    '',
    list(
      'Files Loaded',
      [...ranked.source, ...ranked.docs, ...ranked.adrs].map((f) => f.path),
    ),
    list(
      'Skills',
      ranked.skills.map((s) => s.name),
    ),
    list(
      'Agents',
      ranked.agents.map((a) => a.name),
    ),
    list(
      'Commands',
      ranked.commands.map((c) => c.name),
    ),
    '',
    `Estimated Context: ${ranked.totalFiles} files / ${kb(ranked.totalBytes)}`,
    ...ranked.warnings.map((w) => `WARN: ${w}`),
  ]
    .filter((l) => l !== '')
    .join('\n');
}
