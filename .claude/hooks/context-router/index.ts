#!/usr/bin/env -S npx --no-install tsx
/**
 * Context Router — Claude Code `UserPromptSubmit` hook entry point.
 *
 * Flow:
 *   read prompt (stdin JSON) → detect coding task → extract feature
 *     → cache lookup (graph-fingerprinted)
 *     → graphify query → classify → rank/limit
 *     → fallback (semantic → filesystem) on a graphify miss
 *     → inject a bounded context package (stdout) + log the `[Context Router]` summary.
 *
 * Contract with Claude Code: for a `UserPromptSubmit` hook, whatever we print to
 * stdout on exit 0 is appended to the model's context. stderr is shown in the
 * transcript but not to the model. This hook is FAIL-OPEN: any error is logged and
 * we exit 0 with no injected context, so a router problem never blocks a prompt.
 *
 * Run standalone for testing:  echo '{"prompt":"/implement OTP expiration"}' | npx tsx index.ts
 *                        or:   npx tsx index.ts --prompt "/implement OTP expiration"
 */
import { loadConfig } from './src/config.ts';
import { Logger } from './src/logger.ts';
import { detectTask, topicTokens } from './src/detect.ts';
import { runGraphifyQuery } from './src/graphify.ts';
import { rankContext } from './src/rank.ts';
import { graphFingerprint, normalizeFeature, readCache, writeCache } from './src/cache.ts';
import { filesystemFallback, semanticFallback } from './src/fallback.ts';
import { renderInjectedContext, renderLogBlock } from './src/contextPackage.ts';
import type { RankedContext, RoutingResult, RoutingSource } from './src/types.ts';

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve('');
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(data));
  });
}

function getPromptFromArgs(): string | null {
  const i = process.argv.indexOf('--prompt');
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

/** Parse the hook payload (`{ prompt, cwd, ... }`) or fall back to raw text. */
function extractPrompt(stdin: string): { prompt: string; cwd?: string } {
  const trimmed = stdin.trim();
  if (!trimmed) return { prompt: '' };
  try {
    const json = JSON.parse(trimmed) as { prompt?: string; cwd?: string };
    if (typeof json.prompt === 'string') return { prompt: json.prompt, cwd: json.cwd };
  } catch {
    /* not JSON — treat the raw stdin as the prompt (useful for manual testing) */
  }
  return { prompt: trimmed };
}

async function main(): Promise<void> {
  const stdin = await readStdin();
  const argPrompt = getPromptFromArgs();
  const { prompt: stdinPrompt, cwd } = extractPrompt(stdin);
  const prompt = argPrompt ?? stdinPrompt;

  const projectRoot = process.env.CLAUDE_PROJECT_DIR || cwd || process.cwd();
  const { config, problems } = loadConfig(projectRoot);
  const logger = new Logger(config.logging);
  for (const p of problems) logger.warn(p);

  if (!config.enabled) {
    logger.debug('router disabled via config — exiting');
    return;
  }
  if (!prompt.trim()) {
    logger.debug('empty prompt — nothing to route');
    return;
  }

  // 1. Is this a coding task?
  const detection = detectTask(prompt, config);
  if (!detection.isCoding) {
    logger.debug(`not routed: ${detection.reason}`);
    return; // no stdout → no context injected
  }

  const feature = detection.topic;
  const featureKey = normalizeFeature(feature);
  const tokens = topicTokens(feature);
  const fingerprint = graphFingerprint(config);
  logger.info(`routing "${feature}" (key=${featureKey}) — ${detection.reason}`);

  // 2. Cache lookup (auto-invalidated by graph/HEAD fingerprint).
  let result = readCache(config, featureKey, fingerprint, logger);

  // 3. Fresh routing: graphify, then fallbacks.
  if (!result) {
    let source: RoutingSource = 'graphify';
    let nodesFound = 0;

    const graph = runGraphifyQuery(feature, config, logger);
    let nodes = graph.nodes;
    nodesFound = graph.nodesFound;

    if (nodes.length === 0) {
      logger.warn('graphify returned no nodes — trying semantic fallback');
      nodes = semanticFallback(tokens, config, logger);
      source = 'semantic-fallback';
    }
    if (nodes.length === 0) {
      logger.warn('semantic fallback empty — trying filesystem fallback');
      nodes = filesystemFallback(tokens, config, logger);
      source = 'filesystem-fallback';
    }

    if (nodes.length === 0) {
      // Deliberately do NOT fall back to a whole-repo read.
      const empty: RankedContext = {
        source: [],
        docs: [],
        adrs: [],
        skills: [],
        agents: [],
        commands: [],
        warnings: [
          'No graph, semantic, or filename matches. Gather context on demand — do not read the whole repo.',
        ],
        totalFiles: 0,
        totalBytes: 0,
      };
      result = {
        feature,
        query: feature,
        nodesFound: 0,
        ranked: empty,
        source: 'none',
        fromCache: false,
      };
    } else {
      const ranked = rankContext(nodes, tokens, config);
      result = { feature, query: feature, nodesFound, ranked, source, fromCache: false };
      writeCache(config, featureKey, feature, fingerprint, result, logger);
    }
  }

  // 4. Emit: injected context (stdout) + human log block (file/stderr).
  const finalResult: RoutingResult = result;
  const logBlock = renderLogBlock(finalResult);
  logger.block(logBlock);

  const injected = renderInjectedContext(finalResult);
  const payload = config.logging.showBlockInContext ? `${logBlock}\n\n${injected}` : injected;
  process.stdout.write(`${payload}\n`);
}

main()
  .catch((err) => {
    // Fail-open: never block a prompt because of a router bug.
    try {
      process.stderr.write(`[Context Router] non-fatal error: ${(err as Error).stack ?? err}\n`);
    } catch {
      /* ignore */
    }
  })
  .finally(() => process.exit(0));
