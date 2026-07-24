import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { runCaptured } from '@ai-bridge/proc';
import type { LocalContext } from '../../context.ts';
import { delegate } from '../../delegate.ts';
import { DEFAULT_MODEL, formatUnknownModelError, resolveModel } from '../../models.ts';
import { preflightModel, renderPreflightRefusal } from '../../quotaPreflight.ts';
import { startRun } from '../../runlog.ts';

export interface ReviewFlags {
  readonly model?: string;
  readonly plan?: string;
  readonly base?: string;
  readonly out?: string;
  readonly timeout?: number;
  readonly preflight: boolean;
}

export type ReviewVerdictResult =
  | { readonly kind: 'pass' }
  | {
      readonly kind: 'findings';
      readonly critical: number;
      readonly major: number;
      readonly minor: number;
      readonly formattedLine: string;
    }
  | { readonly kind: 'unparseable'; readonly rawLine: string };

function matchVerdictLine(line: string): ReviewVerdictResult | null {
  if (/^PASS\b/i.test(line)) {
    return { kind: 'pass' };
  }
  const match = line.match(
    /^FINDINGS:\s*(?:(\d+)\s*critical,?\s*)?(?:(\d+)\s*major,?\s*)?(?:(\d+)\s*minor)?/i,
  );
  if (match) {
    const critical = match[1] ? Number.parseInt(match[1], 10) : 0;
    const major = match[2] ? Number.parseInt(match[2], 10) : 0;
    const minor = match[3] ? Number.parseInt(match[3], 10) : 0;
    const formattedLine = `FINDINGS: ${critical} critical, ${major} major, ${minor} minor`;
    return { kind: 'findings', critical, major, minor, formattedLine };
  }
  return null;
}

export function parseReviewVerdict(response: string): ReviewVerdictResult {
  const lines = response
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0);
  if (lines.length === 0) {
    return { kind: 'unparseable', rawLine: '' };
  }

  const first = matchVerdictLine(lines[0] as string);
  if (first) return first;
  const last = matchVerdictLine(lines[lines.length - 1] as string);
  if (last) return last;

  const embedded = [
    ...response.matchAll(/FINDINGS:\s*(\d+)\s*critical,?\s*(\d+)\s*major,?\s*(\d+)\s*minor/gi),
  ].at(-1);
  if (embedded) {
    const critical = Number.parseInt(embedded[1] as string, 10);
    const major = Number.parseInt(embedded[2] as string, 10);
    const minor = Number.parseInt(embedded[3] as string, 10);
    return {
      kind: 'findings',
      critical,
      major,
      minor,
      formattedLine: `FINDINGS: ${critical} critical, ${major} major, ${minor} minor`,
    };
  }

  return { kind: 'unparseable', rawLine: lines[0] as string };
}

export default async function review(this: LocalContext, flags: ReviewFlags): Promise<void> {
  const inputSlug = flags.model ?? DEFAULT_MODEL;
  const model = resolveModel(inputSlug);
  if (!model) {
    this.process.stderr.write(`${formatUnknownModelError(inputSlug)}\n`);
    this.process.exitCode = 2;
    return;
  }

  const cwd = this.process.cwd();
  const baseRef = flags.base ?? 'HEAD';

  let absPlanPath: string | undefined;
  if (flags.plan) {
    absPlanPath = isAbsolute(flags.plan) ? flags.plan : resolve(cwd, flags.plan);
    if (!existsSync(absPlanPath)) {
      this.process.stderr.write(`ai-bridge review: plan file "${absPlanPath}" not found\n`);
      this.process.exitCode = 2;
      return;
    }
  }

  const diffRes = await runCaptured('git', ['diff', '--quiet', baseRef], { cwd });
  if (diffRes.code !== 0 && diffRes.code !== 1) {
    const detail = diffRes.stderr.trim().split('\n')[0] ?? `exit code ${diffRes.code}`;
    this.process.stderr.write(
      `ai-bridge review: git diff failed for base "${baseRef}": ${detail}\n`,
    );
    this.process.exitCode = 2;
    return;
  }
  const hasDiff = diffRes.code === 1;

  const statusRes = await runCaptured('git', ['status', '--porcelain'], { cwd });
  const hasPorcelain = statusRes.code === 0 && statusRes.stdout.trim().length > 0;

  const isDirty = hasDiff || hasPorcelain;

  if (!isDirty && !absPlanPath) {
    this.process.stderr.write(`ai-bridge review: nothing to review\n`);
    this.process.exitCode = 2;
    return;
  }

  if (flags.preflight) {
    const verdict = await preflightModel(model);
    if (!verdict.ok) {
      this.process.stderr.write(`${renderPreflightRefusal('review', verdict)}\n`);
      this.process.exitCode = 3;
      return;
    }
    if (verdict.warning) this.process.stderr.write(`ai-bridge review: ${verdict.warning}\n`);
  }

  const timeoutSec = flags.timeout ?? 1200;
  const modeDetail = isDirty
    ? absPlanPath
      ? `diff + plan (${absPlanPath})`
      : `diff (${baseRef})`
    : `plan-only (${absPlanPath})`;

  const run = startRun('review', `${model.spec.slug}: ${modeDetail}`);

  const absOutPath = flags.out
    ? isAbsolute(flags.out)
      ? flags.out
      : resolve(cwd, flags.out)
    : resolve(run.dir, 'review.md');

  let reviewPrompt: string;
  if (isDirty) {
    reviewPrompt =
      `You are an expert code reviewer. Inspect the working tree diff against base '${baseRef}' and untracked files at ${cwd}.\n` +
      (absPlanPath
        ? `Compare the implementation against the plan contract at ${absPlanPath}. Any file modified or feature added outside the plan contract counts as over-reach (severity: major unless harmful, then critical).\n`
        : '') +
      `Write your detailed review report to the file ${absOutPath}. For each finding, include file:line, severity (critical|major|minor), and rationale.\n` +
      `Your final answer (last message) must consist of EXACTLY ONE VERDICT LINE:\n` +
      `Either: "PASS"\n` +
      `Or: "FINDINGS: <c> critical, <m> major, <n> minor"`;
  } else {
    reviewPrompt =
      `You are an expert architecture reviewer. Inspect the plan contract file at ${absPlanPath}.\n` +
      `Review the plan for soundness, missing edge cases, safety, and feasibility.\n` +
      `Write your detailed review report to the file ${absOutPath}. For each finding, include severity (critical|major|minor) and rationale.\n` +
      `Your final answer (last message) must consist of EXACTLY ONE VERDICT LINE:\n` +
      `Either: "PASS"\n` +
      `Or: "FINDINGS: <c> critical, <m> major, <n> minor"`;
  }

  const outcome = await delegate({
    model,
    prompt: reviewPrompt,
    tools: true,
    timeoutSec,
    cwd,
    run,
  });

  if (!outcome.ok) {
    this.process.stderr.write(`${outcome.message}\n`);
    this.process.exitCode = 1;
    return;
  }

  if (!existsSync(absOutPath) || readFileSync(absOutPath, 'utf8').trim().length === 0) {
    this.process.stderr.write(`ai-bridge review: review file was not written to ${absOutPath}\n`);
    this.process.exitCode = 1;
    return;
  }

  const verdictResult = parseReviewVerdict(outcome.response);

  if (verdictResult.kind === 'unparseable') {
    this.process.stderr.write(
      `ai-bridge review: could not parse a verdict line from the answer.\n`,
    );
    this.process.stdout.write(`${outcome.response}\nreview: ${absOutPath}\nrun: ${run.id}\n`);
    this.process.exitCode = 1;
    return;
  }

  if (verdictResult.kind === 'pass') {
    this.process.stdout.write(`PASS\nreview: ${absOutPath}\nrun: ${run.id}\n`);
    this.process.exitCode = 0;
    return;
  }

  this.process.stdout.write(
    `${verdictResult.formattedLine}\nreview: ${absOutPath}\nrun: ${run.id}\n`,
  );
  const isPassing = verdictResult.critical === 0 && verdictResult.major === 0;
  this.process.exitCode = isPassing ? 0 : 1;
}
