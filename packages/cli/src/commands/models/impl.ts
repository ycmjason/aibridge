import type { LocalContext } from '../../context.ts';
import { detectInstalled, type Installed } from '../../installed.ts';
import { BACKEND_NAMES, BACKENDS, imageAlphaFor, imageFormatFor, MODELS } from '../../models.ts';

export interface ModelsFlags {
  readonly json: boolean;
}

export default async function modelsImpl(
  this: LocalContext,
  flags: ModelsFlags,
  installed?: Installed,
): Promise<void> {
  const detected = installed ?? (await detectInstalled());
  const specs = Object.values(MODELS);

  if (flags.json) {
    const jsonOutput = specs.map(spec => {
      const probe = detected.get(spec.backend);
      return {
        slug: spec.slug,
        backend: spec.backend,
        backendModel: spec.backendModel,
        efforts: spec.efforts ? [...spec.efforts] : [],
        defaultEffort: spec.defaultEffort ?? null,
        image: imageFormatFor({ spec, effort: undefined }) ?? null,
        imageAlpha: imageAlphaFor({ spec, effort: undefined }) ?? null,
        brief: spec.brief,
        roles: spec.roles ?? null,
        installed: probe?.ok === true,
        version: probe?.ok ? probe.version : null,
      };
    });
    this.process.stdout.write(`${JSON.stringify(jsonOutput)}\n`);
    return;
  }

  let firstBackend = true;
  for (const backend of BACKENDS) {
    if (!firstBackend) {
      this.process.stdout.write('\n');
    }
    firstBackend = false;

    const probe = detected.get(backend);
    if (!probe?.ok) {
      const hint = probe ? probe.error.replace(/^aibridge: /, '') : 'not probed';
      this.process.stdout.write(`=== ${BACKEND_NAMES[backend]} — not installed ===\n  ${hint}\n`);
      continue;
    }

    this.process.stdout.write(`=== ${BACKEND_NAMES[backend]} — ${probe.version} ===\n`);
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
      const alpha = imageAlphaFor({ spec, effort: undefined });
      const imageStr = img ? `${img} (alpha: ${alpha ?? '—'})` : '—';
      segments.push(`image: ${imageStr}`);
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
