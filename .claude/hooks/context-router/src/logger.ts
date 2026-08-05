/**
 * Tiny leveled logger. Writes structured lines to a log file and, optionally,
 * to stderr. On a `UserPromptSubmit` hook, stderr is surfaced in Claude Code's
 * transcript/debug view but is NOT fed to the model, so it is safe for diagnostics.
 *
 * The logger never throws — a logging failure must never break prompt submission.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { LogLevel, RouterConfig } from './types.ts';

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export class Logger {
  private readonly enabled: boolean;
  private readonly threshold: number;
  private readonly file: string;
  private readonly toStderr: boolean;
  private ensured = false;

  constructor(cfg: RouterConfig['logging']) {
    this.enabled = cfg.enabled;
    this.threshold = ORDER[cfg.level] ?? ORDER.info;
    this.file = cfg.file;
    this.toStderr = cfg.toStderr;
  }

  private write(level: LogLevel, msg: string): void {
    if (!this.enabled || ORDER[level] < this.threshold) return;
    const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${msg}`;
    try {
      if (!this.ensured) {
        mkdirSync(dirname(this.file), { recursive: true });
        this.ensured = true;
      }
      appendFileSync(this.file, line + '\n');
    } catch {
      /* logging must never break the hook */
    }
    if (this.toStderr) {
      try {
        process.stderr.write(line + '\n');
      } catch {
        /* ignore */
      }
    }
  }

  debug(msg: string): void {
    this.write('debug', msg);
  }
  info(msg: string): void {
    this.write('info', msg);
  }
  warn(msg: string): void {
    this.write('warn', msg);
  }
  error(msg: string): void {
    this.write('error', msg);
  }

  /** Emit a multi-line human block verbatim (used for the `[Context Router]` summary). */
  block(text: string): void {
    if (!this.enabled) return;
    for (const line of text.split('\n')) this.write('info', line);
  }
}
