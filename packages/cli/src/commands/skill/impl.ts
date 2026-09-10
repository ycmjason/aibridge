import { existsSync, readFileSync } from 'node:fs';
import type { LocalContext } from '../../context.ts';
import {
  detectInstalled,
  type Installed,
  installedBackends,
  missingLines,
} from '../../installed.ts';
import {
  BACKENDS,
  type Backend,
  imageFormatFor,
  listModels,
  modelFor,
  type Role,
} from '../../models.ts';
import { PACKAGE_VERSION } from '../../package.ts';

const TOPICS = {
  plan: 'reference/plan.md',
  implement: 'reference/implement.md',
  review: 'reference/review.md',
  subagent: 'reference/subagent.md',
  'image-gen': 'reference/image-gen.md',
  'image-cutout': 'reference/image-cutout.md',
  why: 'reference/why.md',
} as const;

export type SkillTopic = keyof typeof TOPICS;

const ROLES: readonly Role[] = ['plan', 'implement', 'review', 'image-gen'];

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

function modelTable(installed: ReadonlySet<Backend>): string {
  const models = listModels({ installed });
  if (models.length === 0) {
    return 'No models are available until a backend CLI above is installed and signed in.';
  }
  const curated = models.filter(s => s.roles);
  const rows = curated.map(spec => {
    const cells = ROLES.map(role => {
      const r = spec.roles?.[role];
      if (role === 'image-gen') {
        const fmt = imageFormatFor({ spec, effort: undefined });
        if (!fmt) return '✗';
        return `${r?.level === 'recommended' ? '✅' : '○'} ${FORMAT_LABEL[fmt]}`;
      }
      if (!r) return '✗';
      return r.level === 'recommended' ? `✅${r.note ? ` ${r.note}` : ''}` : '○';
    });
    return `| \`${spec.slug}\` | ${cells.join(' | ')} |`;
  });
  const table = [
    '| slug | plan | implement | review | image-gen |',
    '|---|---|---|---|---|',
    ...rows,
  ];
  const others = models.filter(s => !s.roles).map(s => `\`${s.slug}\``);
  const out = [table.join('\n')];
  if (others.length > 0) {
    out.push(
      `Also registered: ${others.join(', ')}. Run \`aibridge models [--json]\` for exact per-model facts.`,
    );
  }
  return out.join('\n\n');
}

function imageModelTable(installed: ReadonlySet<Backend>): string {
  const rows = listModels({ installed, imageOnly: true })
    .filter(s => s.roles?.['image-gen'])
    .map(s => {
      const rec = s.roles?.['image-gen']?.level === 'recommended' ? ' (recommended)' : '';
      const fmt = imageFormatFor({ spec: s, effort: undefined });
      return `| \`${s.slug}\`${rec} | ${RENDERS_VIA[s.backend]} | ${fmt ? FORMAT_LABEL[fmt] : '—'} |`;
    });
  return ['| slug | renders via | format |', '|---|---|---|', ...rows].join('\n');
}

const FORMAT_LABEL = { jpg: 'JPEG', png: 'PNG' } as const;

const IF_BLOCK = /<!-- if:([\w,]+) -->\n?([\s\S]*?)<!-- endif -->\n?/g;

/** Resolves placeholders and `<!-- if:backend -->` blocks against what is installed. */
export function applyTemplate(text: string, installed: Installed): string {
  const present = installedBackends(installed);
  // Each stage prefers a backend the previous one did not use, so a full
  // machine yields the documented grok plans / gemini implements / grok reviews
  // pairing and the reviewer is cross-family from the implementer whenever it
  // can be. With a single backend every role falls back to the same family.
  const without = (b: Backend | undefined) => new Set([...present].filter(x => x !== b));
  const planner = modelFor('plan', present);
  const implementer =
    modelFor('implement', without(planner?.backend)) ?? modelFor('implement', present);
  const reviewer = modelFor('review', without(implementer?.backend)) ?? modelFor('review', present);
  const slug = (m: { slug: string } | undefined) => m?.slug ?? '<slug>';
  return text
    .replace(IF_BLOCK, (_m, backends: string, body: string) =>
      backends.split(',').some(b => present.has(b as Backend)) ? body : '',
    )
    .replaceAll('{{installed}}', installedBlock(installed))
    .replaceAll('{{models}}', modelTable(present))
    .replaceAll('{{image-models}}', imageModelTable(present))
    .replaceAll('{{plan}}', slug(planner))
    .replaceAll('{{implement}}', slug(implementer))
    .replaceAll('{{review}}', slug(reviewer))
    .replaceAll('{{image}}', slug(modelFor('image-gen', present)));
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
