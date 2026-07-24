import { type AgyQuotaSnapshot, fetchAgyQuota } from '@aibridge/driver-agy';
import { type ClaudeQuotaSnapshot, fetchClaudeQuota } from '@aibridge/driver-claude';
import { type CodexQuotaSnapshot, fetchCodexQuota } from '@aibridge/driver-codex';
import { fetchGrokQuota, type GrokQuotaSnapshot } from '@aibridge/driver-grok';
import type { LocalContext } from '../../context.ts';

export interface QuotaFlags {
  readonly json: boolean;
}

function formatReset(resetTime: string | undefined): string {
  if (!resetTime) return '-';
  const ms = new Date(resetTime).getTime() - Date.now();
  if (Number.isNaN(ms)) return resetTime;
  if (ms <= 0) return 'now';
  const mins = Math.round(ms / 60_000);
  const rel = mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h${mins % 60}m`;
  return `${new Date(resetTime).toLocaleTimeString()} (in ${rel})`;
}

function renderGrok(ctx: LocalContext, snapshot: GrokQuotaSnapshot): void {
  ctx.process.stdout.write('=== grok (xAI) — used this period ===\n');
  ctx.process.stdout.write(`${'PERIOD'.padEnd(10)} ${'USED'.padEnd(10)} RESET\n`);
  const usedPctStr = snapshot.usedPercent !== undefined ? `${snapshot.usedPercent}%` : '?';
  const periodStr = snapshot.periodType ?? '-';
  ctx.process.stdout.write(
    `${periodStr.padEnd(10)} ${usedPctStr.padEnd(10)} ${formatReset(snapshot.periodEnd)}\n`,
  );
  if (snapshot.products.length > 0) {
    const prods = snapshot.products.map(p => `${p.product} ${p.usedPercent}%`).join(' · ');
    ctx.process.stdout.write(`  ${prods}\n`);
  }
}

function renderAgy(ctx: LocalContext, snapshot: AgyQuotaSnapshot): void {
  ctx.process.stdout.write('=== agy (Antigravity) — remaining per model group ===\n');
  for (const group of snapshot.groups) {
    ctx.process.stdout.write(`${group.displayName}\n`);
    for (const b of group.buckets) {
      const pct =
        b.remainingFraction === 0 ? 'EXHAUSTED' : `${Math.round(b.remainingFraction * 100)}%`;
      ctx.process.stdout.write(
        `  ${b.displayName.padEnd(18)} ${pct.padEnd(10)} ${formatReset(b.resetTime)}\n`,
      );
    }
  }
  const exhausted = snapshot.models.filter(m => m.exhausted);
  if (exhausted.length > 0) {
    ctx.process.stdout.write(
      `Exhausted models: ${[...new Set(exhausted.map(m => m.label))].join(', ')}\n`,
    );
  }
}

function renderCodex(ctx: LocalContext, snapshot: CodexQuotaSnapshot): void {
  const plan = snapshot.planType ? ` — plan: ${snapshot.planType}` : '';
  const reached = snapshot.limitReached ? ' [LIMIT REACHED]' : '';
  ctx.process.stdout.write(`=== codex (ChatGPT)${plan}${reached} — used per window ===\n`);
  ctx.process.stdout.write(`${'WINDOW'.padEnd(10)} ${'USED'.padEnd(10)} RESET\n`);
  for (const w of snapshot.windows) {
    ctx.process.stdout.write(
      `${w.window.padEnd(10)} ${`${w.usedPercent}%`.padEnd(10)} ${formatReset(w.resetAt)}\n`,
    );
  }
}

function renderClaude(ctx: LocalContext, snapshot: ClaudeQuotaSnapshot): void {
  ctx.process.stdout.write('=== claude (Claude Code subscription) — used per window ===\n');
  ctx.process.stdout.write(`${'WINDOW'.padEnd(20)} ${'USED'.padEnd(10)} RESET\n`);
  for (const w of snapshot.windows) {
    ctx.process.stdout.write(
      `${w.window.padEnd(20)} ${`${w.usedPercent}%`.padEnd(10)} ${w.resetsText || '-'}\n`,
    );
  }
}

function renderSection<T>(
  ctx: LocalContext,
  result: PromiseSettledResult<T>,
  title: string,
  render: (ctx: LocalContext, snapshot: T) => void,
): void {
  if (result.status === 'fulfilled') {
    render(ctx, result.value);
  } else {
    ctx.process.stdout.write(
      `=== ${title} ===\nunavailable: ${(result.reason as Error).message}\n`,
    );
  }
}

export default async function quotaImpl(this: LocalContext, flags: QuotaFlags): Promise<void> {
  const [grok, agy, codex, claude] = await Promise.allSettled([
    fetchGrokQuota(),
    fetchAgyQuota(),
    fetchCodexQuota(),
    fetchClaudeQuota(),
  ]);

  const allFailed =
    grok.status === 'rejected' &&
    agy.status === 'rejected' &&
    codex.status === 'rejected' &&
    claude.status === 'rejected';

  if (flags.json) {
    this.process.stdout.write(
      `${JSON.stringify(
        {
          grok: grok.status === 'fulfilled' ? grok.value : { error: String(grok.reason) },
          agy: agy.status === 'fulfilled' ? agy.value : { error: String(agy.reason) },
          codex: codex.status === 'fulfilled' ? codex.value : { error: String(codex.reason) },
          claude: claude.status === 'fulfilled' ? claude.value : { error: String(claude.reason) },
        },
        null,
        2,
      )}\n`,
    );
    if (allFailed) this.process.exitCode = 1;
    return;
  }

  renderSection(this, grok, 'grok (xAI)', renderGrok);
  this.process.stdout.write('\n');
  renderSection(this, agy, 'agy (Antigravity)', renderAgy);
  this.process.stdout.write('\n');
  renderSection(this, codex, 'codex (ChatGPT)', renderCodex);
  this.process.stdout.write('\n');
  renderSection(this, claude, 'claude (Claude Code subscription)', renderClaude);
  if (allFailed) this.process.exitCode = 1;
}
