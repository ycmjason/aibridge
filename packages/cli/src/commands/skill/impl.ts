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
  listSeats,
  type Role,
  seatFor,
} from '../../models.ts';
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
    lines.push('Not installed (their seats are omitted below):', ...missing);
  }
  return lines.join('\n');
}

function seatTable(installed: ReadonlySet<Backend>): string {
  const seats = listSeats({ installed });
  const curated = seats.filter(s => s.roles);
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
  const others = seats.filter(s => !s.roles).map(s => `\`${s.slug}\``);
  const out = [table.join('\n')];
  if (others.length > 0) {
    out.push(
      `Also registered: ${others.join(', ')}. Run \`aibridge models [--json]\` for exact per-seat facts.`,
    );
  }
  return out.join('\n\n');
}

function imageSeatTable(installed: ReadonlySet<Backend>): string {
  const rows = listSeats({ installed, imageOnly: true })
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
  const slugFor = (role: Role): string => seatFor(role, present)?.slug ?? '<slug>';
  // The reviewer must be cross-family from the implementer, so pick it from the
  // other installed backends first and only fall back to the same family.
  const implementer = seatFor('implement', present);
  const otherBackends = new Set([...present].filter(b => b !== implementer?.backend));
  const reviewer = seatFor('review', otherBackends) ?? seatFor('review', present);
  return text
    .replace(IF_BLOCK, (_m, backends: string, body: string) =>
      backends.split(',').some(b => present.has(b as Backend)) ? body : '',
    )
    .replaceAll('{{installed}}', installedBlock(installed))
    .replaceAll('{{seats}}', seatTable(present))
    .replaceAll('{{image-seats}}', imageSeatTable(present))
    .replaceAll('{{plan}}', slugFor('plan'))
    .replaceAll('{{implement}}', slugFor('implement'))
    .replaceAll('{{review}}', reviewer?.slug ?? '<slug>')
    .replaceAll('{{image}}', slugFor('image-gen'));
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
    const detected = installed ?? (await detectInstalled());
    if (installedBackends(detected).size === 0) {
      this.process.stderr.write(
        `aibridge skill: no backend CLI found on PATH; install and sign in to at least one:\n${missingLines(detected).join('\n')}\n`,
      );
      this.process.exitCode = 1;
      return;
    }
    this.process.stdout.write(renderSkill(topic as SkillTopic | undefined, detected));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    this.process.stderr.write(`aibridge skill: ${message}\n`);
    this.process.exitCode = 1;
  }
}
