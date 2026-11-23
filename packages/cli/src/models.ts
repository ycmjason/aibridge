/**
 * Canonical model registry and resolution for aibridge.
 *
 * Models are registered by canonical, provider-qualified slug —
 * `<vendor>-<cli>/<model>[-<effort>]`, e.g. `openai-codex/gpt-5.6-sol-high`.
 * Canonical slugs only — no short aliases, by design. That holds on both sides:
 * `backendModel` is a pinned model id (`claude-sonnet-5`), never a moving vendor
 * alias (`opus`), so a slug never silently changes model under you.
 */

export type Backend = 'agy' | 'claude' | 'codex' | 'grok';
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/** Every backend, in the order listings print them. */
export const BACKENDS: readonly Backend[] = ['grok', 'agy', 'codex', 'claude'];

export const BACKEND_NAMES: Record<Backend, string> = {
  grok: 'grok (Grok CLI)',
  agy: 'agy (Antigravity)',
  codex: 'codex (Codex CLI)',
  claude: 'claude (Claude Code CLI)',
};

export interface ModelSpec {
  readonly slug: string; // canonical, effort-less
  readonly backend: Backend;
  readonly backendModel: string; // always explicit — never "whatever the CLI defaults to"
  readonly efforts: readonly Effort[] | null;
  readonly defaultEffort?: Effort; // only when backend REQUIRES one (agy gemini)
  readonly brief: string;
}

export interface ResolvedModel {
  readonly spec: ModelSpec;
  readonly effort: Effort | undefined;
}

export const MODELS: Record<string, ModelSpec> = {
  'xai-grok/grok-4.7': {
    slug: 'xai-grok/grok-4.7',
    backend: 'grok',
    backendModel: 'grok-4.7',
    efforts: ['low', 'medium', 'high', 'xhigh'],
    brief:
      'xAI Grok 4.7 via grok CLI — grok CLI default; own xAI login; ~30 req/min, ~1k msgs/day, single-flight',
  },
  'xai-grok/grok-4.7-build-fast': {
    slug: 'xai-grok/grok-4.7-build-fast',
    backend: 'grok',
    backendModel: 'grok-4.7-build-fast',
    efforts: ['low', 'medium', 'high', 'xhigh'],
    brief:
      'xAI Grok 4.7 Build Fast via grok CLI — fast coding tier; own xAI login; ~30 req/min, ~1k msgs/day, single-flight',
  },
  'xai-grok/grok-4.6': {
    slug: 'xai-grok/grok-4.6',
    backend: 'grok',
    backendModel: 'grok-4.6',
    efforts: ['low', 'medium', 'high'],
    brief:
      'xAI Grok 4.6 via grok CLI — reasoning tier; own xAI login; ~30 req/min, ~1k msgs/day, single-flight',
  },
  // Both grok tiers stay registered: 4.6 and 4.5 differ in character, not just
  // recency, so this is two models of one class rather than a superseded pin.
  'xai-grok/grok-4.5': {
    slug: 'xai-grok/grok-4.5',
    backend: 'grok',
    backendModel: 'grok-4.5',
    efforts: ['low', 'medium', 'high'],
    brief:
      'xAI Grok 4.5 via grok CLI — follows detailed instructions literally; own xAI login; ~30 req/min, ~1k msgs/day, single-flight',
  },
  // First agy seat: the skill's image table names the first model per backend.
  'google-antigravity/gemini-3.8-flash': {
    slug: 'google-antigravity/gemini-3.8-flash',
    backend: 'agy',
    backendModel: 'gemini-3.8-flash',
    efforts: ['low', 'medium', 'high'],
    defaultEffort: 'high',
    brief:
      'Google Gemini 3.8 Flash via agy — own Antigravity login; quota shared across all Gemini tiers',
  },
  'google-antigravity/gemini-4-neon': {
    slug: 'google-antigravity/gemini-4-neon',
    backend: 'agy',
    backendModel: 'gemini-4-neon',
    efforts: ['low', 'medium', 'high', 'xhigh'],
    defaultEffort: 'high',
    brief:
      'Google Gemini 4 Neon via agy — own Antigravity login; quota shared across all Gemini tiers',
  },
  'google-antigravity/gemini-4-carbon': {
    slug: 'google-antigravity/gemini-4-carbon',
    backend: 'agy',
    backendModel: 'gemini-4-carbon',
    efforts: ['low', 'medium', 'high'],
    defaultEffort: 'high',
    brief:
      'Google Gemini 4 Carbon via agy — own Antigravity login; quota shared across all Gemini tiers',
  },
  'google-antigravity/gemini-4-argon': {
    slug: 'google-antigravity/gemini-4-argon',
    backend: 'agy',
    backendModel: 'gemini-4-argon',
    efforts: ['low', 'medium', 'high'],
    defaultEffort: 'high',
    brief:
      'Google Gemini 4 Argon via agy — own Antigravity login; quota shared across all Gemini tiers',
  },
  'google-antigravity/gemini-4-hydrogen': {
    slug: 'google-antigravity/gemini-4-hydrogen',
    backend: 'agy',
    backendModel: 'gemini-4-hydrogen',
    efforts: ['low', 'medium', 'high', 'xhigh'],
    defaultEffort: 'high',
    brief:
      'Google Gemini 4 Hydrogen via agy — own Antigravity login; quota shared across all Gemini tiers',
  },
  // agy lists the orchestrators with no effort suffix.
  'google-antigravity/gemini-pro-orchestrator-neon': {
    slug: 'google-antigravity/gemini-pro-orchestrator-neon',
    backend: 'agy',
    backendModel: 'gemini-pro-orchestrator-neon',
    efforts: null,
    brief:
      'Google Orchestrator (Neon) via agy — own Antigravity login; quota shared across all Gemini tiers (not itemised per-model, so no exhaustion preflight)',
  },
  'google-antigravity/gemini-pro-orchestrator': {
    slug: 'google-antigravity/gemini-pro-orchestrator',
    backend: 'agy',
    backendModel: 'gemini-pro-orchestrator',
    efforts: null,
    brief:
      'Google Orchestrator (Carbon) via agy — own Antigravity login; quota shared across all Gemini tiers (not itemised per-model, so no exhaustion preflight)',
  },
  'google-antigravity/gemini-pro-orchestrator-argon': {
    slug: 'google-antigravity/gemini-pro-orchestrator-argon',
    backend: 'agy',
    backendModel: 'gemini-pro-orchestrator-argon',
    efforts: null,
    brief:
      'Google Orchestrator (Argon) via agy — own Antigravity login; quota shared across all Gemini tiers (not itemised per-model, so no exhaustion preflight)',
  },
  'google-antigravity/claude-opus-5-5': {
    slug: 'google-antigravity/claude-opus-5-5',
    backend: 'agy',
    backendModel: 'claude-opus-5-5',
    efforts: ['low', 'medium', 'high'],
    defaultEffort: 'high',
    brief:
      'Claude Opus 5.5 via agy — own Antigravity login; quota shared with the other Claude and GPT-OSS seats on agy; heavyweight',
  },
  'google-antigravity/claude-sonnet-5-5': {
    slug: 'google-antigravity/claude-sonnet-5-5',
    backend: 'agy',
    backendModel: 'claude-sonnet-5-5',
    efforts: ['low', 'medium', 'high'],
    defaultEffort: 'high',
    brief:
      'Claude Sonnet 5.5 via agy — own Antigravity login; quota shared with the other Claude and GPT-OSS seats on agy',
  },
  'google-antigravity/gpt-oss-120b-medium': {
    slug: 'google-antigravity/gpt-oss-120b-medium',
    backend: 'agy',
    backendModel: 'gpt-oss-120b-medium',
    efforts: null,
    brief:
      'GPT-OSS 120B (medium) via agy — own Antigravity login; quota shared with the Claude seats on agy',
  },
  // Codex serves `ultra` on every seat below except the two luna tiers; it is not in `Effort` yet.
  // ponytail: add 'ultra' to Effort when a run actually needs it.
  // Briefs carry codex's own description of each model (models_cache.json, 2026-11-23).
  'openai-codex/gpt-6.2-sol': {
    slug: 'openai-codex/gpt-6.2-sol',
    backend: 'codex',
    backendModel: 'gpt-6.2-sol',
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    brief:
      'OpenAI gpt-6.2-sol via codex CLI — fast, go-to model for coding and everyday work; own ChatGPT login',
  },
  'openai-codex/gpt-6.2-astra': {
    slug: 'openai-codex/gpt-6.2-astra',
    backend: 'codex',
    backendModel: 'gpt-6.2-astra',
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    brief:
      'OpenAI gpt-6.2-astra via codex CLI — most capable model for complex coding and professional work; own ChatGPT login',
  },
  'openai-codex/gpt-6.1-terra': {
    slug: 'openai-codex/gpt-6.1-terra',
    backend: 'codex',
    backendModel: 'gpt-6.1-terra',
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    brief:
      'OpenAI gpt-6.1-terra via codex CLI — efficient model for visual understanding and computer use; own ChatGPT login',
  },
  'openai-codex/gpt-6.1-sol': {
    slug: 'openai-codex/gpt-6.1-sol',
    backend: 'codex',
    backendModel: 'gpt-6.1-sol',
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    brief:
      'OpenAI gpt-6.1-sol via codex CLI — previous-generation model for coding and everyday work; own ChatGPT login',
  },
  'openai-codex/gpt-6-astra': {
    slug: 'openai-codex/gpt-6-astra',
    backend: 'codex',
    backendModel: 'gpt-6-astra',
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    brief:
      'OpenAI gpt-6-astra via codex CLI — previous-generation model for complex coding and professional work; own ChatGPT login',
  },
  'openai-codex/gpt-6-sol': {
    slug: 'openai-codex/gpt-6-sol',
    backend: 'codex',
    backendModel: 'gpt-6-sol',
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    brief:
      'OpenAI gpt-6-sol via codex CLI — legacy model for coding and everyday work; own ChatGPT login',
  },
  'openai-codex/gpt-6-luna': {
    slug: 'openai-codex/gpt-6-luna',
    backend: 'codex',
    backendModel: 'gpt-6-luna',
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    brief:
      'OpenAI gpt-6-luna via codex CLI — fast and affordable model for easier tasks; own ChatGPT login',
  },
  'openai-codex/gpt-5.6-sol': {
    slug: 'openai-codex/gpt-5.6-sol',
    backend: 'codex',
    backendModel: 'gpt-5.6-sol',
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    brief:
      'OpenAI gpt-5.6-sol via codex CLI — legacy model for coding and everyday work; own ChatGPT login',
  },
  'openai-codex/gpt-5.6-terra': {
    slug: 'openai-codex/gpt-5.6-terra',
    backend: 'codex',
    backendModel: 'gpt-5.6-terra',
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    brief:
      'OpenAI gpt-5.6-terra via codex CLI — legacy balanced model for agentic coding; own ChatGPT login',
  },
  'openai-codex/gpt-5.6-luna': {
    slug: 'openai-codex/gpt-5.6-luna',
    backend: 'codex',
    backendModel: 'gpt-5.6-luna',
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    brief:
      'OpenAI gpt-5.6-luna via codex CLI — legacy fast model for simpler tasks; own ChatGPT login',
  },
  // Every id the latest codex lists as visible stays registered (2026-09-07).
  'anthropic-claude/fable-5.2': {
    slug: 'anthropic-claude/fable-5.2',
    backend: 'claude',
    backendModel: 'claude-fable-5-2',
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    defaultEffort: 'high',
    brief:
      'Claude Fable 5.2 via claude CLI — newest Fable tier, hardest and longest-running work; bills the claude CLI subscription',
  },
  'anthropic-claude/fable-5.1': {
    slug: 'anthropic-claude/fable-5.1',
    backend: 'claude',
    backendModel: 'claude-fable-5-1',
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    defaultEffort: 'high',
    brief:
      'Claude Fable 5.1 via claude CLI — previous Fable tier; bills the claude CLI subscription',
  },
  'anthropic-claude/opus-5.5': {
    slug: 'anthropic-claude/opus-5.5',
    backend: 'claude',
    backendModel: 'claude-opus-5-5[1m]',
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    defaultEffort: 'high',
    brief:
      'Claude Opus 5.5, 1M context via claude CLI — claude CLI default; bills the claude CLI subscription',
  },
  'anthropic-claude/sonnet-5.5': {
    slug: 'anthropic-claude/sonnet-5.5',
    backend: 'claude',
    backendModel: 'claude-sonnet-5-5',
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    brief:
      'Claude Sonnet 5.5 via claude CLI — newest Sonnet tier; bills the claude CLI subscription',
  },
  'anthropic-claude/opus-5': {
    slug: 'anthropic-claude/opus-5',
    backend: 'claude',
    backendModel: 'claude-opus-5[1m]',
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    defaultEffort: 'high',
    brief:
      'Claude Opus 5, 1M context via claude CLI — everyday complex work; bills the claude CLI subscription',
  },
  'anthropic-claude/sonnet-5': {
    slug: 'anthropic-claude/sonnet-5',
    backend: 'claude',
    backendModel: 'claude-sonnet-5',
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    brief: 'Claude Sonnet 5 via claude CLI — routine work; bills the claude CLI subscription',
  },
  'anthropic-claude/haiku-5.5': {
    slug: 'anthropic-claude/haiku-5.5',
    backend: 'claude',
    backendModel: 'claude-haiku-5-5',
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    brief:
      'Claude Haiku 5.5 via claude CLI — newest Haiku tier, quick answers; bills the claude CLI subscription',
  },
  'anthropic-claude/haiku-4-5': {
    slug: 'anthropic-claude/haiku-4-5',
    backend: 'claude',
    backendModel: 'claude-haiku-4-5-20251001',
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    brief:
      'Claude Haiku 4.5 via claude CLI — previous Haiku tier; bills the claude CLI subscription',
  },
} as const satisfies Record<string, ModelSpec>;

export type ImageFormat = 'jpg' | 'png';

/**
 * How a model gets to a transparent PNG: `native` renders alpha when the prompt
 * asks for it (generate only — with a reference attached codex paints a fake
 * checkerboard instead); `cutout` means render on a flat backdrop, then
 * `image-cutout`.
 */
export type ImageAlpha = 'native' | 'cutout';

const IMAGE_GEN_FORMATS: ReadonlyMap<Backend, ImageFormat> = new Map([
  ['agy', 'jpg'],
  ['codex', 'png'],
  ['grok', 'jpg'],
]);

const IMAGE_ALPHA: ReadonlyMap<Backend, ImageAlpha> = new Map([
  ['agy', 'cutout'],
  ['codex', 'native'],
  ['grok', 'cutout'],
]);

export function supportsImageGen(resolved: ResolvedModel): boolean {
  return IMAGE_GEN_FORMATS.has(resolved.spec.backend);
}

export function imageFormatFor(resolved: ResolvedModel): ImageFormat | undefined {
  return IMAGE_GEN_FORMATS.get(resolved.spec.backend);
}

export function imageAlphaFor(resolved: ResolvedModel): ImageAlpha | undefined {
  return IMAGE_ALPHA.get(resolved.spec.backend);
}

const EFFORTS_SET: ReadonlySet<string> = new Set<Effort>(['low', 'medium', 'high', 'xhigh', 'max']);

export function resolveModel(input: string): ResolvedModel | undefined {
  if (MODELS[input]) {
    const spec = MODELS[input];
    return { spec, effort: spec.defaultEffort };
  }

  const lastDashIdx = input.lastIndexOf('-');
  if (lastDashIdx > 0) {
    const prefix = input.slice(0, lastDashIdx);
    const token = input.slice(lastDashIdx + 1);

    const spec = MODELS[prefix];

    if (
      spec &&
      EFFORTS_SET.has(token) &&
      spec.efforts &&
      (spec.efforts as readonly string[]).includes(token)
    ) {
      return { spec, effort: token as Effort };
    }
  }

  return undefined;
}

export function backendModelId(resolved: ResolvedModel): string {
  if (resolved.spec.backend === 'agy') {
    const effort = resolved.effort ?? resolved.spec.defaultEffort;
    if (effort) {
      return `${resolved.spec.backendModel}-${effort}`;
    }
  }
  return resolved.spec.backendModel;
}

export interface ListOptions {
  readonly imageOnly?: boolean;
  /** When given, only models on these backends are listed. */
  readonly installed?: ReadonlySet<Backend>;
}

/** Registry entries, optionally narrowed to installed backends and image models. */
export function listModels(opts: ListOptions = {}): ModelSpec[] {
  return Object.values(MODELS).filter(
    spec =>
      (!opts.imageOnly || IMAGE_GEN_FORMATS.has(spec.backend)) &&
      (!opts.installed || opts.installed.has(spec.backend)),
  );
}

export function listModelHelpLines(opts: ListOptions = {}): string[] {
  const lines: string[] = [];
  for (const spec of listModels(opts)) {
    lines.push(`  ${spec.slug}`);
    lines.push(`    ${spec.brief}`);
    if (opts.imageOnly) {
      const alpha = IMAGE_ALPHA.get(spec.backend);
      if (alpha !== undefined) {
        lines.push(
          `    transparency: ${alpha === 'native' ? 'native alpha — ask for a transparent background in the prompt (no --image)' : 'none — render on flat white, then `aibridge image-cutout`'}`,
        );
      }
    }
  }
  if (opts.installed) {
    lines.push(`  (installed backends: ${formatBackends(opts.installed)})`);
  } else {
    lines.push(
      '  (every registered model; run `aibridge models` to see which backends are installed here)',
    );
  }
  return lines;
}

export function formatBackends(installed: ReadonlySet<Backend>): string {
  const names = BACKENDS.filter(b => installed.has(b));
  return names.length > 0 ? names.join(', ') : 'none';
}

export function formatUnknownModelError(input: string, installed?: ReadonlySet<Backend>): string {
  const lines = [
    `Unknown model "${input}".`,
    'Available models:',
    ...listModelHelpLines({ installed }),
  ];
  return lines.join('\n');
}

export function formatImageGenModelError(
  input: string,
  resolved: ResolvedModel,
  installed?: ReadonlySet<Backend>,
): string {
  return [
    `Model "${input}" (${resolved.spec.slug}) cannot generate images — backend "${resolved.spec.backend}" has no image path.`,
    'Image-gen models (canonical slug):',
    ...listModelHelpLines({ imageOnly: true, installed }),
  ].join('\n');
}
