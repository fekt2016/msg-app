/**
 * Configuration loading. Defaults live here so the router works even with no
 * `.context-router.json` present. A project-level `.context-router.json` at the
 * repo root overrides any subset of these values (deep-merged).
 */
import { readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import type { RouterConfig } from './types.ts';

export const CONFIG_FILENAME = '.context-router.json';

const DEFAULTS: Omit<RouterConfig, 'projectRoot'> = {
  enabled: true,
  graphifyCommand: 'graphify',
  graphPath: 'graphify-out/graph.json',
  queryTimeoutMs: 8000,
  codingTriggers: [
    '/implement',
    '/plan',
    '/review',
    '/refactor',
    '/fix',
    '/security',
    '/performance',
    '/release',
    '/ship',
    '/debug',
    '/test',
  ],
  detectNonSlashTasks: true,
  codingKeywordPatterns: [
    '\\b(implement|add|build|create|scaffold|wire up)\\b.+\\b(endpoint|route|service|repository|model|screen|hook|migration|schema|module|feature|socket event)\\b',
    '\\b(fix|debug|resolve)\\b.+\\b(bug|error|failing test|crash|regression)\\b',
    '\\b(refactor|optimi[sz]e|harden|secure)\\b',
  ],
  ignoreIntentPatterns: [
    '^\\s*(hi|hey|hello|yo|thanks|thank you|ok|okay|cool|nice)\\b',
    '^\\s*(what|why|how|when|who|where)\\b.*\\?\\s*$',
    '^\\s*(explain|describe|summari[sz]e|tell me|what is|what does|what are|how does|walk me through)\\b',
  ],
  fullRepoOverridePatterns: [
    '\\b(whole|entire|full|across the (whole|entire))\\s+(repo|repository|codebase|project)\\b',
    '\\bscan (the )?(whole|entire|full)?\\s*(repo|repository|codebase)\\b',
    '\\bignore the context router\\b',
    '\\bno context router\\b',
  ],
  limits: {
    maxSourceFiles: 20,
    maxDocs: 6,
    maxAdrs: 3,
    maxSkills: 4,
    maxAgents: 3,
    maxCommands: 3,
    maxContextBytes: 120000,
    graphifyBudget: 3000,
  },
  cache: {
    enabled: true,
    dir: '.claude/hooks/context-router/.cache',
    ttlSeconds: 86400,
  },
  logging: {
    enabled: true,
    level: 'info',
    file: '.claude/hooks/context-router/.cache/router.log',
    toStderr: true,
    showBlockInContext: true,
  },
  fallback: {
    semantic: true,
    filesystem: true,
    searchGlobs: ['backend/src', 'frontend/src', 'docs', '.opencode', 'CLAUDE.md'],
  },
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Deep-merge `override` onto `base`. Arrays are replaced wholesale, not concatenated. */
function deepMerge<T>(base: T, override: unknown): T {
  if (!isObject(override)) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, val] of Object.entries(override)) {
    if (key.startsWith('$')) continue; // ignore JSON-schema hints like "$schema"
    const cur = out[key];
    out[key] = isObject(cur) && isObject(val) ? deepMerge(cur, val) : val;
  }
  return out as T;
}

/** Resolve a possibly-relative path against the project root. */
function abs(root: string, p: string): string {
  return isAbsolute(p) ? p : resolve(root, p);
}

/**
 * Load and resolve the effective configuration. Never throws: a malformed
 * config file falls back to defaults (with a note pushed to `problems`).
 */
export function loadConfig(projectRoot: string): { config: RouterConfig; problems: string[] } {
  const problems: string[] = [];
  let fileCfg: unknown = {};

  try {
    const raw = readFileSync(join(projectRoot, CONFIG_FILENAME), 'utf8');
    fileCfg = JSON.parse(raw);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code !== 'ENOENT') problems.push(`Could not read ${CONFIG_FILENAME}: ${e.message}`);
  }

  const merged = deepMerge(DEFAULTS, fileCfg);
  const config: RouterConfig = {
    ...merged,
    projectRoot,
    graphPath: abs(projectRoot, merged.graphPath),
    cache: { ...merged.cache, dir: abs(projectRoot, merged.cache.dir) },
    logging: { ...merged.logging, file: abs(projectRoot, merged.logging.file) },
  };

  return { config, problems };
}
