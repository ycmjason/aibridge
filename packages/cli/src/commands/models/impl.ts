import type { LocalContext } from '../../context.ts';
import { type Backend, imageFormatFor, MODELS } from '../../models.ts';

export interface ModelsFlags {
  readonly json: boolean;
}

const BACKEND_DISPLAY_NAMES: Record<Backend, string> = {
  grok: 'grok (Grok CLI)',
  agy: 'agy (Antigravity)',
  codex: 'codex (Codex CLI)',
  claude: 'claude (Claude Code CLI)',
};

export default function modelsImpl(this: LocalContext, flags: ModelsFlags): void {
  const specs = Object.values(MODELS);

  if (flags.json) {
    const jsonOutput = specs.map(spec => ({
      slug: spec.slug,
      backend: spec.backend,
      backendModel: spec.backendModel,
      efforts: spec.efforts ? [...spec.efforts] : [],
      defaultEffort: spec.defaultEffort ?? null,
      image: imageFormatFor({ spec, effort: undefined }) ?? null,
      brief: spec.brief,
    }));
    this.process.stdout.write(`${JSON.stringify(jsonOutput)}\n`);
    return;
  }

  const backends: Backend[] = [];
  for (const spec of specs) {
    if (!backends.includes(spec.backend)) {
      backends.push(spec.backend);
    }
  }

  let firstBackend = true;
  for (const backend of backends) {
    if (!firstBackend) {
      this.process.stdout.write('\n');
    }
    firstBackend = false;

    this.process.stdout.write(`=== ${BACKEND_DISPLAY_NAMES[backend]} ===\n`);
    const backendSpecs = specs.filter(spec => spec.backend === backend);
    for (const spec of backendSpecs) {
      this.process.stdout.write(`  ${spec.slug}\n`);

      const segments: string[] = [];
      if (spec.efforts) {
        const formattedEfforts = spec.efforts
          .map(e => (e === spec.defaultEffort ? `${e}*` : e))
          .join(' | ');
        segments.push(`efforts: ${formattedEfforts}`);
      }
      const img = imageFormatFor({ spec, effort: undefined });
      segments.push(`image: ${img ?? '—'}`);
      segments.push(`id: ${spec.backendModel}`);

      this.process.stdout.write(`    ${segments.join(' · ')}\n`);
      this.process.stdout.write(`    ${spec.brief}\n`);
    }
  }

  const hasDefaultEffort = specs.some(spec => spec.defaultEffort !== undefined);
  if (hasDefaultEffort) {
    this.process.stdout.write('\n* = effort used when the slug has no -<effort> suffix\n');
  }
}
