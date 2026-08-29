import { existsSync, readFileSync } from 'node:fs';
import type { LocalContext } from '../../context.ts';
import { PACKAGE_VERSION } from '../../package.ts';

const TOPICS = {
  plan: 'reference/plan.md',
  implement: 'reference/implement.md',
  review: 'reference/review.md',
  subagent: 'reference/subagent.md',
  'image-gen': 'reference/image-gen.md',
  why: 'reference/why.md',
} as const;

export type SkillTopic = keyof typeof TOPICS;

function instructionPath(relativePath: string): URL {
  const candidates = [
    // Built package: dist/cli.mjs -> instructions/
    new URL(`../instructions/${relativePath}`, import.meta.url),
    // Source tree: src/commands/skill/impl.ts -> instructions/
    new URL(`../../../instructions/${relativePath}`, import.meta.url),
  ];
  const found = candidates.find(candidate => existsSync(candidate));
  if (!found) {
    throw new Error(`bundled instruction file is missing: ${relativePath}`);
  }
  return found;
}

function readInstruction(relativePath: string): string {
  return readFileSync(instructionPath(relativePath), 'utf8').trimEnd();
}

export default function skillImpl(this: LocalContext, topic?: string): void {
  if (topic !== undefined && !(topic in TOPICS)) {
    this.process.stderr.write(
      `aibridge skill: unknown topic ${JSON.stringify(topic)}; expected one of: ${Object.keys(TOPICS).join(', ')}\n`,
    );
    this.process.exitCode = 2;
    return;
  }

  try {
    const runner = `npx -y @aibridge/cli@${PACKAGE_VERSION}`;
    const sections = [
      `Command runner for these instructions: \`${runner}\`\nUse that exact prefix for every aibridge command below; do not substitute a global binary.`,
      readInstruction('SKILL.md'),
    ];

    if (topic !== undefined) {
      sections.push(readInstruction(TOPICS[topic as SkillTopic]));
    }

    this.process.stdout.write(`${sections.join('\n\n---\n\n')}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    this.process.stderr.write(`aibridge skill: ${message}\n`);
    this.process.exitCode = 1;
  }
}
