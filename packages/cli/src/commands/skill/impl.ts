import { existsSync, readFileSync } from 'node:fs';
import type { LocalContext } from '../../context.ts';
import {
  detectInstalled,
  type Installed,
  installedBackends,
  missingLines,
} from '../../installed.ts';
import { BACKENDS, type Backend, imageFormatFor, listModels } from '../../models.ts';
import { PACKAGE_VERSION } from '../../package.ts';

const TOPICS = {
  subagent: 'reference/subagent.md',
  'image-gen': 'reference/image-gen.md',
  'image-cutout': 'reference/image-cutout.md',
  why: 'reference/why.md',
} as const;

export type SkillTopic = keyof typeof TOPICS;

const RENDERS_VIA: Record<Backend, string> = {
  codex: 'Codex CLI',
  agy: 'Antigravity CLI (`agy`)',
  grok: '`api.x.ai` directly, on `~/.grok/auth.json`',
  claude: '—',
};

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

function installedBlock(installed: Installed): string {
  const present = BACKENDS.flatMap(b => {
    const a = installed.get(b);
    return a?.ok ? [`\`${b}\` (${a.version})`] : [];
  });
  const lines = [`Backend CLIs installed on this machine: ${present.join(', ') || 'none'}.`];
  const missing = missingLines(installed);
  if (missing.length > 0) {
    lines.push(
      present.length === 0
        ? 'Install and sign in to at least one of these before delegating:'
        : 'Not installed (their models are omitted below):',
      ...missing,
    );
  }
  return lines.join('\n');
}

function modelList(installed: ReadonlySet<Backend>): string {
  const models = listModels({ installed });
  if (models.length === 0) {
    return 'No models are available until a backend CLI above is installed and signed in.';
  }
  return models.map(s => `- \`${s.slug}\` — ${s.brief}`).join('\n');
}

/** One row per installed image backend: format and render path are per backend, not per model. */
function imageModelTable(installed: ReadonlySet<Backend>): string {
  const rows = BACKENDS.filter(b => installed.has(b)).flatMap(backend => {
    const models = listModels({ installed: new Set([backend]), imageOnly: true });
    const first = models[0];
    if (!first) return [];
    const fmt = imageFormatFor({ spec: first, effort: undefined });
    const slugs = models.map(s => `\`${s.slug}\``).join(', ');
    return [`| ${slugs} | ${RENDERS_VIA[backend]} | ${fmt ? FORMAT_LABEL[fmt] : '—'} |`];
  });
  return ['| models | renders via | format |', '|---|---|---|', ...rows].join('\n');
}

const FORMAT_LABEL = { jpg: 'JPEG', png: 'PNG' } as const;

const IF_BLOCK = /<!-- if:([\w,]+) -->\n?([\s\S]*?)<!-- endif -->\n?/g;

/** Resolves placeholders and `<!-- if:backend -->` blocks against what is installed. */
export function applyTemplate(text: string, installed: Installed): string {
  const present = installedBackends(installed);
  const image = listModels({ installed: present, imageOnly: true })[0]?.slug ?? '<slug>';
  return text
    .replace(IF_BLOCK, (_m, backends: string, body: string) =>
      backends.split(',').some(b => present.has(b as Backend)) ? body : '',
    )
    .replaceAll('{{installed}}', installedBlock(installed))
    .replaceAll('{{models}}', modelList(present))
    .replaceAll('{{image-models}}', imageModelTable(present))
    .replaceAll('{{image}}', image);
}

export function renderSkill(topic: SkillTopic | undefined, installed: Installed): string {
  const runner = `npx -y @aibridge/cli@${PACKAGE_VERSION}`;
  const sections = [
    `Command runner for these instructions: \`${runner}\`\nUse that exact prefix for every aibridge command below; do not substitute a global binary.`,
    applyTemplate(readInstruction('SKILL.md'), installed),
  ];
  if (topic !== undefined) {
    sections.push(applyTemplate(readInstruction(TOPICS[topic]), installed));
  }
  return `${sections.join('\n\n---\n\n')}\n`;
}

export default async function skillImpl(
  this: LocalContext,
  topic?: string,
  installed?: Installed,
): Promise<void> {
  if (topic !== undefined && !(topic in TOPICS)) {
    this.process.stderr.write(
      `aibridge skill: unknown topic ${JSON.stringify(topic)}; expected one of: ${Object.keys(TOPICS).join(', ')}\n`,
    );
    this.process.exitCode = 2;
    return;
  }

  try {
    // A bare machine still gets the router: the install hints in it are what
    // the agent needs next, and CI smoke-tests this path with no CLI present.
    const detected = installed ?? (await detectInstalled());
    this.process.stdout.write(renderSkill(topic as SkillTopic | undefined, detected));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    this.process.stderr.write(`aibridge skill: ${message}\n`);
    this.process.exitCode = 1;
  }
}
