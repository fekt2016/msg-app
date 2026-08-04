/**
 * Path → category classification. Pure and dependency-free so it is trivially
 * testable and easy to extend (add a rule, add a category).
 */
import { basename } from 'node:path';
import type { Category } from './types.ts';

/** Normalize Windows separators so rules can assume forward slashes. */
function norm(p: string): string {
  return p.replace(/\\/g, '/');
}

export function categorize(path: string): Category {
  const p = norm(path);
  if (p.includes('.claude/agents/')) return 'agent';
  if (p.includes('.claude/skills/')) return 'skill';
  if (p.includes('.claude/commands/')) return 'command';
  if (p.includes('docs/architecture-decisions/')) return 'adr';
  if (
    p.endsWith('.md') ||
    p.includes('.opencode/') ||
    p.includes('/docs/') ||
    p.startsWith('docs/')
  ) {
    return 'doc';
  }
  return 'source';
}

/**
 * Human-facing name for a reference file. Skills are named by their directory,
 * agents by filename, commands by their `/name` invocation.
 */
export function referenceName(category: Category, path: string): string {
  const p = norm(path);
  switch (category) {
    case 'skill': {
      const m = p.match(/\.claude\/skills\/([^/]+)/);
      return m ? m[1] : basename(p);
    }
    case 'agent':
      return basename(p).replace(/\.md$/, '');
    case 'command':
      return '/' + basename(p).replace(/\.md$/, '');
    default:
      return p;
  }
}
