/**
 * Shared types for the Context Router.
 *
 * The router runs as a Claude Code `UserPromptSubmit` hook. It decides whether
 * a prompt is a coding task, asks Graphify for the smallest relevant subgraph,
 * and turns that into a bounded, ranked "context package" that is injected into
 * the model's context — so the model starts from a handful of files instead of
 * scanning the whole repository.
 */

/** Where a selected file belongs in the injected package. */
export type Category = 'source' | 'doc' | 'adr' | 'skill' | 'agent' | 'command';

/** Effort/verbosity level for the logger. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface RouterLimits {
  /** Max source files (`backend/src`, `frontend/src`, …) to surface. */
  maxSourceFiles: number;
  /** Max long-form docs (CLAUDE.md, `.opencode/*.md`, `docs/**`). */
  maxDocs: number;
  /** Max Architecture Decision Records. */
  maxAdrs: number;
  /** Max skills to recommend invoking. */
  maxSkills: number;
  /** Max agents to recommend. */
  maxAgents: number;
  /** Max related slash-commands to list. */
  maxCommands: number;
  /** Hard ceiling on the on-disk size of surfaced files (source + doc + adr). */
  maxContextBytes: number;
  /** `--budget` passed to `graphify query` (token budget of the subgraph). */
  graphifyBudget: number;
}

export interface RouterConfig {
  enabled: boolean;

  graphifyCommand: string;
  graphPath: string;
  queryTimeoutMs: number;

  codingTriggers: string[];
  detectNonSlashTasks: boolean;
  codingKeywordPatterns: string[];
  ignoreIntentPatterns: string[];
  fullRepoOverridePatterns: string[];

  limits: RouterLimits;

  cache: {
    enabled: boolean;
    dir: string;
    ttlSeconds: number;
  };

  logging: {
    enabled: boolean;
    level: LogLevel;
    file: string;
    toStderr: boolean;
    /** Include the human-readable `[Context Router]` block in the injected context. */
    showBlockInContext: boolean;
  };

  fallback: {
    semantic: boolean;
    filesystem: boolean;
    searchGlobs: string[];
  };

  /** Absolute project root, injected at load time (not part of the JSON file). */
  projectRoot: string;
}

/** One node parsed from `graphify query` output. */
export interface GraphNode {
  name: string;
  /** Repo-relative source path. */
  src: string;
  /** Location marker, e.g. `L21`. */
  loc: string;
  community: string;
}

/** A repository file selected for the context package, with its relevance score. */
export interface ScoredFile {
  /** Repo-relative path. */
  path: string;
  category: Category;
  /** Higher = more relevant. */
  score: number;
  /** Index of the node's first appearance in the graphify traversal (lower = closer). */
  firstIndex: number;
  /** How many graph nodes resolved to this file. */
  hits: number;
  /** On-disk size in bytes (0 if unreadable). */
  sizeBytes: number;
}

/** A skill / agent / command reference (something the model *invokes*, not reads). */
export interface Reference {
  /** Display name, e.g. `eaz-authentication` or `authentication`. */
  name: string;
  /** Repo-relative path to the defining file. */
  path: string;
  score: number;
}

export interface RankedContext {
  source: ScoredFile[];
  docs: ScoredFile[];
  adrs: ScoredFile[];
  skills: Reference[];
  agents: Reference[];
  commands: Reference[];
  /** Non-fatal safeguard messages (truncation, oversize, …). */
  warnings: string[];
  /** Count of files the model is asked to read (source + doc + adr). */
  totalFiles: number;
  /** Summed on-disk bytes of those files. */
  totalBytes: number;
}

/** Result of classifying a prompt. */
export interface Detection {
  isCoding: boolean;
  /** The matched slash command, if any (lower-cased, e.g. `/implement`). */
  command: string | null;
  /** Extracted feature/topic, e.g. `OTP expiration`. */
  topic: string;
  /** Human explanation of the decision (for logs). */
  reason: string;
  /** User explicitly asked for the whole repo — router stands down. */
  fullRepoOverride: boolean;
}

export type RoutingSource =
  'graphify' | 'cache' | 'semantic-fallback' | 'filesystem-fallback' | 'none';

export interface RoutingResult {
  feature: string;
  query: string;
  nodesFound: number;
  ranked: RankedContext;
  source: RoutingSource;
  fromCache: boolean;
}
