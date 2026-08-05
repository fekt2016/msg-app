// graphify OpenCode plugin
// Ports the Claude Code graphify hook setup (`.claude/settings.json`) to opencode:
//
//   Claude `UserPromptSubmit`            ->  `chat.message` hook: runs the
//        context-router and appends its injected context as a synthetic part.
//   Claude `PreToolUse Bash|Grep`       ->  `experimental.chat.system.transform`:
//        injects the `graphify hook-guard search` mandate as a standing system
//        instruction (opencode's tool.execute.before can only mutate tool args,
//        not add model context, so the guard lives in the system prompt).
//   Claude `PreToolUse Read|Glob`       ->  same mechanism, `hook-guard read`.
//   Claude bash-echo reminder           ->  `tool.execute.before`: prepends a
//        plain-words echo before the first bash command (kept from the original
//        graphify install; backtick-free so it cannot trigger command substitution).
//
// IMPORTANT: keep the echo reminder string free of backticks and $(...) constructs.
// The hook prepends `echo "<reminder>" ; <cmd>` to the user's bash command;
// backticks inside the double-quoted echo trigger bash command substitution,
// which both corrupts tool output and silently executes the very graphify
// command we are only suggesting. Plain words render fine in opencode's TUI.
//
// Every hook is fail-open: a router or graphify error never blocks a prompt.
import { existsSync } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';

const GRAPH_PATH = join('graphify-out', 'graph.json');
const ROUTER_PATH = join('.claude', 'hooks', 'context-router', 'index.ts');
const GRAPHIFY_BIN = '/Users/mac/.local/bin/graphify';
const GUARD_MARKER = '[graphify hook-guard]';

export const GraphifyPlugin = async ({ directory }) => {
  const graphPath = join(directory, GRAPH_PATH);
  const routerPath = join(directory, ROUTER_PATH);
  const hasGraph = () => existsSync(graphPath);
  const hasRouter = () => existsSync(routerPath);

  let reminded = false;
  let guardCache = null;

  // Run a command with JSON piped to stdin; resolves with the process's stdout.
  // Uses `spawn` + explicit stdin end: Node's execFile+input hangs on children
  // that keep reading stdin. Never rejects — errors resolve to { stdout: "" }.
  const runWithInput = (command, args, input, cwd) =>
    new Promise((resolve) => {
      let stdout = '';
      let done = false;
      const settle = (value) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(value);
      };
      const timer = setTimeout(() => {
        try {
          child.kill();
        } catch {
          /* ignore */
        }
        settle({ stdout });
      }, 30000);

      let child;
      try {
        child = spawn(command, args, {
          cwd,
          env: { ...process.env, CLAUDE_PROJECT_DIR: directory },
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch {
        settle({ stdout });
        return;
      }

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      child.on('error', () => settle({ stdout }));
      child.on('close', () => settle({ stdout }));
      child.stdin.on('error', () => settle({ stdout }));
      child.stdin.write(input);
      child.stdin.end();
    });

  // Run the context-router with the user prompt; returns its injected context
  // or "" on any error (fail-open). The router detects non-coding prompts itself.
  const runRouter = async (prompt) => {
    if (!hasGraph() || !hasRouter() || !prompt.trim()) return '';
    try {
      const { stdout } = await runWithInput(
        'npx',
        ['--no-install', 'tsx', routerPath],
        JSON.stringify({ prompt, cwd: directory }),
        directory,
      );
      return stdout.trim();
    } catch {
      return '';
    }
  };

  // Fetch a `graphify hook-guard <kind>` mandate, cached after first fetch.
  // The guard only emits context when `tool_input` looks like a real search/read,
  // so we pass representative payloads that match its detection heuristics.
  const hookGuard = async (kind) => {
    if (guardCache && guardCache[kind] != null) return guardCache[kind];
    let text = '';
    try {
      const payload =
        kind === 'read'
          ? {
              tool_name: 'Read',
              tool_input: {
                file_path: join(directory, 'backend/src/modules/auth/auth.service.ts'),
              },
            }
          : { tool_name: 'Bash', tool_input: { command: 'grep -r pattern .' } };
      const { stdout } = await runWithInput(
        GRAPHIFY_BIN,
        ['hook-guard', kind],
        JSON.stringify(payload),
        directory,
      );
      const parsed = JSON.parse(stdout);
      text = parsed.hookSpecificOutput?.additionalContext ?? '';
    } catch {
      text = '';
    }
    guardCache = { ...(guardCache ?? {}), [kind]: text };
    return text;
  };

  return {
    // Claude UserPromptSubmit equivalent: route the prompt through the
    // context-router and attach its output to the message the model sees.
    'chat.message': async (input, output) => {
      if (!hasGraph() || !hasRouter()) return;
      const text = (output.parts || [])
        .filter((p) => p.type === 'text' && !p.synthetic)
        .map((p) => p.text)
        .join('\n');
      if (!text.trim()) return;

      const injected = await runRouter(text);
      if (!injected) return;

      const msg = output.message;
      output.parts.push({
        id: `prt_${Date.now().toString(16)}${Math.random().toString(36).slice(2, 12)}`,
        sessionID: msg?.sessionID ?? input.sessionID,
        messageID: msg?.id ?? input.messageID,
        type: 'text',
        text: injected,
        synthetic: true,
      });
    },

    // Claude PreToolUse hook-guard equivalent: inject the search/read mandates
    // as a standing system instruction (opencode can't add model context from
    // tool.execute.before, so the guard lives in the system prompt).
    'experimental.chat.system.transform': async (input, output) => {
      if (!hasGraph()) return;
      if (output.system.some((s) => typeof s === 'string' && s.includes(GUARD_MARKER))) return;

      const [search, read] = await Promise.all([hookGuard('search'), hookGuard('read')]);
      const guard = [search, read].filter(Boolean).join('\n\n');
      if (!guard) return;
      output.system.push(`${GUARD_MARKER}\n${guard}`);
    },

    // Keep the original per-bash-command reminder (fires once per session).
    'tool.execute.before': async (input, output) => {
      if (reminded) return;
      if (!hasGraph()) return;

      if (input.tool === 'bash') {
        // ';' not '&&' — Windows PowerShell 5.1 rejects '&&' as a statement
        // separator, breaking the first bash command of the session (#1646).
        output.args.command =
          'echo "[graphify] knowledge graph at graphify-out/. For focused questions, run graphify query with your question (scoped subgraph, usually much smaller than GRAPH_REPORT.md) instead of grepping raw files. Read GRAPH_REPORT.md only for broad architecture context." ; ' +
          output.args.command;
        reminded = true;
      }
    },
  };
};
