/**
 * Prompt classification: is this a coding task, and if so, what is it about?
 *
 * Two independent decisions:
 *   1. Should the router act at all? (slash trigger, or a conservative
 *      keyword-intent match; but never on greetings / doc questions / "explain".)
 *   2. What feature/topic should Graphify be asked about?
 */
import type { Detection, RouterConfig } from './types.ts';

/** Verbs stripped from the front of a topic so `/implement Add OTP expiration` → `OTP expiration`. */
const LEADING_VERBS = new Set([
  'add',
  'implement',
  'create',
  'build',
  'scaffold',
  'fix',
  'debug',
  'resolve',
  'refactor',
  'review',
  'update',
  'optimize',
  'optimise',
  'harden',
  'secure',
  'improve',
  'remove',
  'delete',
  'write',
  'make',
  'wire',
  'ship',
  'release',
  'the',
  'a',
  'an',
  'to',
  'up',
]);

const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'to',
  'for',
  'of',
  'in',
  'on',
  'and',
  'or',
  'with',
  'into',
  'please',
  'can',
  'you',
  'we',
  'i',
  'our',
  'my',
  'this',
  'that',
  'it',
  'so',
]);

function anyMatch(patterns: string[], text: string): boolean {
  return patterns.some((p) => {
    try {
      return new RegExp(p, 'i').test(text);
    } catch {
      return false; // a bad user-supplied regex must not crash the hook
    }
  });
}

/**
 * Reduce a prompt to a concise topic. Strips a leading slash-command and any
 * leading imperative verbs, drops trailing punctuation, and caps length.
 */
export function extractTopic(prompt: string, command: string | null): string {
  let text = prompt.trim();

  // Drop only the first line's slash-command token; keep multi-line detail.
  if (command) {
    text = text.replace(new RegExp(`^\\s*${escapeRegExp(command)}\\b`, 'i'), '').trim();
  }

  // Use the first non-empty line as the headline topic; extra lines are detail.
  const headline =
    text
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.length > 0) ?? '';

  // Strip leading imperative verbs / articles.
  const words = headline.split(/\s+/).filter(Boolean);
  while (words.length > 1 && LEADING_VERBS.has(words[0].toLowerCase().replace(/[^a-z]/gi, ''))) {
    words.shift();
  }

  const topic = words
    .join(' ')
    .replace(/[.?!,;:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return topic.slice(0, 120);
}

/** Tokenize a topic into lower-cased, de-noised search tokens. */
export function topicTokens(topic: string): string[] {
  return Array.from(
    new Set(
      topic
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 3 && !STOPWORDS.has(t)),
    ),
  );
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Decide whether/how to route a prompt. */
export function detectTask(prompt: string, config: RouterConfig): Detection {
  const trimmed = prompt.trim();
  const firstToken = trimmed.split(/\s+/)[0]?.toLowerCase() ?? '';
  const command = firstToken.startsWith('/') ? firstToken : null;
  const triggers = config.codingTriggers.map((t) => t.toLowerCase());
  const isTrigger = command !== null && triggers.includes(command);

  // Explicit "use the whole repo" wins over everything — even a coding
  // slash-command — because the user has deliberately opted out of scoping.
  if (anyMatch(config.fullRepoOverridePatterns, trimmed)) {
    return {
      isCoding: false,
      command,
      topic: '',
      reason: 'explicit full-repository request — router standing down',
      fullRepoOverride: true,
    };
  }

  // A recognized coding slash-command is authoritative.
  if (isTrigger) {
    const topic = extractTopic(trimmed, command);
    return {
      isCoding: topic.length > 0,
      command,
      topic,
      reason:
        topic.length > 0
          ? `coding slash-command ${command}`
          : `coding slash-command ${command} with no extractable topic`,
      fullRepoOverride: false,
    };
  }

  // A different, non-coding slash-command (e.g. /docs, /handoff): don't route.
  if (command) {
    return {
      isCoding: false,
      command,
      topic: '',
      reason: `non-coding slash-command ${command}`,
      fullRepoOverride: false,
    };
  }

  // Plain prose: ignore obvious conversation / documentation questions.
  if (anyMatch(config.ignoreIntentPatterns, trimmed)) {
    return {
      isCoding: false,
      command: null,
      topic: '',
      reason: 'conversational / documentation intent — ignored',
      fullRepoOverride: false,
    };
  }

  // Conservative keyword-intent detection for non-slash coding prompts.
  if (config.detectNonSlashTasks && anyMatch(config.codingKeywordPatterns, trimmed)) {
    const topic = extractTopic(trimmed, null);
    return {
      isCoding: topic.length > 0,
      command: null,
      topic,
      reason: 'coding-intent keywords matched',
      fullRepoOverride: false,
    };
  }

  return {
    isCoding: false,
    command: null,
    topic: '',
    reason: 'no coding trigger detected',
    fullRepoOverride: false,
  };
}
