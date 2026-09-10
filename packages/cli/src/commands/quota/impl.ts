import type { AgyQuotaSnapshot } from '@aibridge/driver-agy';
import type { ClaudeQuotaSnapshot } from '@aibridge/driver-claude';
import type { CodexQuotaSnapshot } from '@aibridge/driver-codex';
import type { GrokQuotaSnapshot } from '@aibridge/driver-grok';
import type { LocalContext } from '../../context.ts';
import type { QuotaSnapshot } from '../../driver.ts';
import { getDriver } from '../../drivers.ts';
import { detectInstalled, type Installed } from '../../installed.ts';
import { BACKENDS, type Backend } from '../../models.ts';

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

// Rendering only; the process work lives in each driver's quota().
const RENDERERS: Record<Backend, (ctx: LocalContext, snapshot: never) => void> = {
  grok: renderGrok,
  agy: renderAgy,
  codex: renderCodex,
  claude: renderClaude,
};

const TITLES: Record<Backend, string> = {
  grok: 'grok (xAI)',
  agy: 'agy (Antigravity)',
  codex: 'codex (ChatGPT)',
  claude: 'claude (Claude Code subscription)',
};

type Outcome =
  | { readonly kind: 'not-installed'; readonly hint: string }
  | { readonly kind: 'ok'; readonly snapshot: QuotaSnapshot }
  | { readonly kind: 'error'; readonly message: string };

async function fetchOne(backend: Backend, installed: Installed): Promise<Outcome> {
  const probe = installed.get(backend);
  if (!probe?.ok) {
    return { kind: 'not-installed', hint: probe?.error.replace(/^aibridge: /, '') ?? 'not probed' };
  }
  const quota = getDriver(backend).quota;
  if (!quota) return { kind: 'error', message: 'no quota endpoint for this backend' };
  try {
    return { kind: 'ok', snapshot: await quota() };
  } catch (err) {
    return { kind: 'error', message: (err as Error).message };
  }
}

export default async function quotaImpl(
  this: LocalContext,
  flags: QuotaFlags,
  installed?: Installed,
): Promise<void> {
  const detected = installed ?? (await detectInstalled());
  const outcomes = await Promise.all(BACKENDS.map(b => fetchOne(b, detected)));
  const anyOk = outcomes.some(o => o.kind === 'ok');

  if (flags.json) {
    const body = Object.fromEntries(
      BACKENDS.map((b, i) => {
        const o = outcomes[i] as Outcome;
        return [
          b,
          o.kind === 'ok'
            ? o.snapshot
            : o.kind === 'not-installed'
              ? { installed: false, hint: o.hint }
              : { error: o.message },
        ];
      }),
    );
    this.process.stdout.write(`${JSON.stringify(body, null, 2)}\n`);
    if (!anyOk) this.process.exitCode = 1;
    return;
  }

  BACKENDS.forEach((b, i) => {
    if (i > 0) this.process.stdout.write('\n');
    const o = outcomes[i] as Outcome;
    if (o.kind === 'ok') {
      RENDERERS[b](this, o.snapshot as never);
    } else if (o.kind === 'not-installed') {
      this.process.stdout.write(`=== ${TITLES[b]} ===\nnot installed: ${o.hint}\n`);
    } else {
      this.process.stdout.write(`=== ${TITLES[b]} ===\nunavailable: ${o.message}\n`);
    }
  });
  if (!anyOk) this.process.exitCode = 1;
}
