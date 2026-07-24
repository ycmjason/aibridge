import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { runCaptured } from '@aibridge/proc';
import type { LocalContext } from '../../context.ts';
import { delegate } from '../../delegate.ts';
import { DEFAULT_MODEL, formatUnknownModelError, resolveModel } from '../../models.ts';
import { preflightModel, renderPreflightRefusal } from '../../quotaPreflight.ts';
import { startRun } from '../../runlog.ts';

export interface PlanFlags {
  readonly model?: string;
  readonly out?: string;
  readonly timeout?: number;
  readonly preflight: boolean;
}

export function countOpenQuestions(markdown: string): number {
  const headingIdx = markdown.search(/^## Open questions[ \t]*$/m);
  if (headingIdx === -1) return 0;

  const afterHeading = markdown.slice(headingIdx);
  const lines = afterHeading.split(/\r?\n/);
  lines.shift();

  let count = 0;
  for (const line of lines) {
    if (/^## /.test(line)) break;
    const trimmed = line.trim();
    if (trimmed === 'None.' && count === 0) return 0;
    if (/^[-*] /.test(trimmed)) {
      count++;
    }
  }
  return count;
}

async function getPorcelainStatus(cwd: string): Promise<Set<string>> {
  const res = await runCaptured('git', ['status', '--porcelain'], { cwd });
  if (res.code !== 0) return new Set();
  const set = new Set<string>();
  for (const line of res.stdout.split(/\r?\n/)) {
    if (line.trim().length > 0) {
      set.add(line);
    }
  }
  return set;
}

function extractPathFromPorcelainLine(line: string): string {
  let content = line.slice(3).trim();
  if (content.includes(' -> ')) {
    const parts = content.split(' -> ');
    content = (parts[parts.length - 1] ?? '').trim();
  }
  if (content.startsWith('"') && content.endsWith('"')) {
    content = content.slice(1, -1);
  }
  return content;
}

export default async function plan(
  this: LocalContext,
  flags: PlanFlags,
  taskPrompt: string,
): Promise<void> {
  const inputSlug = flags.model ?? DEFAULT_MODEL;
  const model = resolveModel(inputSlug);
  if (!model) {
    this.process.stderr.write(`${formatUnknownModelError(inputSlug)}\n`);
    this.process.exitCode = 2;
    return;
  }

  if (flags.preflight) {
    const verdict = await preflightModel(model);
    if (!verdict.ok) {
      this.process.stderr.write(`${renderPreflightRefusal('plan', verdict)}\n`);
      this.process.exitCode = 3;
      return;
    }
    if (verdict.warning) this.process.stderr.write(`ai-bridge plan: ${verdict.warning}\n`);
  }

  const timeoutSec = flags.timeout ?? 1800;
  const cwd = this.process.cwd();
  const promptSnippet = taskPrompt.replace(/\r?\n/g, ' ').slice(0, 80);
  const run = startRun('plan', `${model.spec.slug}: ${promptSnippet}`);

  const absOutPath = flags.out
    ? isAbsolute(flags.out)
      ? flags.out
      : resolve(cwd, flags.out)
    : resolve(run.dir, 'plan.md');

  const beforePorcelain = await getPorcelainStatus(cwd);

  const plannerPrompt =
    `You are a senior implementation planner. Study the real codebase with your tools at ${cwd}.\n` +
    `Design module boundaries, interfaces, and naming. Name every file to touch and describe what changes; define clear verification gates.\n` +
    `Write EXACTLY one file to the absolute path: ${absOutPath}\n` +
    `Touch nothing else in the working tree.\n` +
    `End the document with a section titled "## Open questions" (write "None." under it if you are confident and have no open questions).\n` +
    `Do not commit or push.\n\n` +
    `Task Prompt:\n${taskPrompt}`;

  const outcome = await delegate({
    model,
    prompt: plannerPrompt,
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

  if (!existsSync(absOutPath)) {
    this.process.stderr.write(`ai-bridge plan: plan file was not written to ${absOutPath}\n`);
    this.process.exitCode = 1;
    return;
  }

  const planContent = readFileSync(absOutPath, 'utf8');
  if (planContent.trim().length === 0) {
    this.process.stderr.write(`ai-bridge plan: plan file at ${absOutPath} is empty\n`);
    this.process.exitCode = 1;
    return;
  }

  if (!/^## Open questions/m.test(planContent)) {
    this.process.stderr.write(
      `ai-bridge plan: plan file at ${absOutPath} missing required "## Open questions" section\n`,
    );
    this.process.exitCode = 1;
    return;
  }

  const afterPorcelain = await getPorcelainStatus(cwd);
  const normalizedOut = resolve(absOutPath);
  const normalizedCwd = resolve(cwd);
  const isOutInRepo = normalizedOut.startsWith(normalizedCwd);

  const unexpectedPaths: string[] = [];
  for (const line of afterPorcelain) {
    if (!beforePorcelain.has(line)) {
      const relPath = extractPathFromPorcelainLine(line);
      const absPath = resolve(cwd, relPath);
      if (isOutInRepo && absPath === normalizedOut) {
        continue;
      }
      unexpectedPaths.push(relPath);
    }
  }

  if (unexpectedPaths.length > 0) {
    this.process.stderr.write(
      `ai-bridge plan: unexpected working tree changes beyond plan file:\n${unexpectedPaths.map(p => `  ${p}`).join('\n')}\n`,
    );
    this.process.exitCode = 1;
    return;
  }

  const openQuestions = countOpenQuestions(planContent);

  this.process.stdout.write(
    `plan: ${absOutPath}\nopen questions: ${openQuestions}\nrun: ${run.id}\n`,
  );
}
