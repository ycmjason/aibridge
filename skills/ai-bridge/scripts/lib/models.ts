/**
 * Canonical model registry and resolution for ai-bridge.
 *
 * Models are registered by canonical, provider-qualified slug —
 * `<vendor>-<cli>/<model>[-<effort>]`, e.g. `openai-codex/gpt-5.6-sol-high`.
 * Canonical slugs only — no short aliases, by design.
 *
 * Verified facts the registry relies on (probed live 2026-07-24):
 * - `agy --model` accepts ID-form names (`agy -p … --model gemini-3.6-flash-low`
 *   answered; agy 1.0.6). Reasoning effort is BAKED INTO agy model ids —
 *   `agy models` lists `gemini-3.6-flash-high|-medium|-low` and no un-suffixed
 *   id exists — hence `defaultEffort` on the gemini entry and the agy branch in
 *   `backendModelId()`.
 * - grok CLI: `--reasoning-effort <EFFORT>` (alias `--effort`); validated
 *   CLIENT-SIDE — an unknown value fails fast with "use one of: high, medium,
 *   low" (probed live 2026-07-24, grok 0.2.111; `--reasoning-effort low`
 *   answered fine).
 * - claude CLI: `--effort low|medium|high|xhigh|max`.
 * - codex CLI: no dedicated flag; effort travels as
 *   `-c model_reasoning_effort=<effort>`. Local default model is `gpt-5.6-sol`
 *   (~/.codex/config.toml), codex-cli 0.145.0.
 * - Un-suffixed slug rule: omit the effort knob entirely and let the backend
 *   CLI use its own configured default — never invent one. The agy exception
 *   is captured by `defaultEffort` (effort is part of the model id there).
 */

export type Backend = 'agy' | 'claude' | 'codex' | 'grok';
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface ModelSpec {
  readonly slug: string; // canonical, effort-less
  readonly backend: Backend;
  readonly backendModel: string | undefined; // undefined = CLI default
  readonly efforts: readonly Effort[] | null;
  readonly defaultEffort?: Effort; // only when backend REQUIRES one (agy gemini)
  readonly brief: string;
}

export interface ResolvedModel {
  readonly spec: ModelSpec;
  readonly effort: Effort | undefined;
}

export const MODELS: Record<string, ModelSpec> = {
  'xai-grok/grok-4.5': {
    slug: 'xai-grok/grok-4.5',
    backend: 'grok',
    backendModel: 'grok-4.5',
    efforts: ['low', 'medium', 'high'],
    brief: 'xAI Grok 4.5 via grok CLI — default for plan & review; off-budget',
  },
  'google-antigravity/gemini-3.6-flash': {
    slug: 'google-antigravity/gemini-3.6-flash',
    backend: 'agy',
    backendModel: 'gemini-3.6-flash',
    efforts: ['low', 'medium', 'high'],
    defaultEffort: 'high',
    brief: 'Google Gemini 3.6 Flash via agy — default for implement; off-budget',
  },
  'google-antigravity/claude-sonnet-4-6': {
    slug: 'google-antigravity/claude-sonnet-4-6',
    backend: 'agy',
    backendModel: 'claude-sonnet-4-6',
    efforts: null,
    brief: 'Claude Sonnet 4.6 (thinking) via agy — off-budget',
  },
  'google-antigravity/claude-opus-4-6-thinking': {
    slug: 'google-antigravity/claude-opus-4-6-thinking',
    backend: 'agy',
    backendModel: 'claude-opus-4-6-thinking',
    efforts: null,
    brief: 'Claude Opus 4.6 (thinking) via agy — off-budget heavyweight',
  },
  'google-antigravity/gpt-oss-120b-medium': {
    slug: 'google-antigravity/gpt-oss-120b-medium',
    backend: 'agy',
    backendModel: 'gpt-oss-120b-medium',
    efforts: null,
    brief: 'GPT-OSS 120B (medium) via agy — off-budget',
  },
  'openai-codex/gpt-5.6-sol': {
    slug: 'openai-codex/gpt-5.6-sol',
    backend: 'codex',
    backendModel: 'gpt-5.6-sol',
    efforts: ['low', 'medium', 'high', 'xhigh'],
    brief: 'OpenAI Codex gpt-5.6-sol via codex CLI',
  },
  'anthropic-claude/sonnet': {
    slug: 'anthropic-claude/sonnet',
    backend: 'claude',
    backendModel: 'sonnet',
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    brief: 'Claude Sonnet via claude CLI — bills your Claude subscription',
  },
  'anthropic-claude/opus': {
    slug: 'anthropic-claude/opus',
    backend: 'claude',
    backendModel: 'opus',
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    defaultEffort: 'high',
    brief: 'Claude Opus via claude CLI (default effort: high) — bills subscription',
  },
} as const satisfies Record<string, ModelSpec>;

export const DEFAULT_MODEL = 'xai-grok/grok-4.5';
export const DEFAULT_IMPLEMENTER = 'google-antigravity/gemini-3.6-flash';
/** Default seat for `image-gen` — keeps the historical gpt-image-2/codex path. */
export const DEFAULT_IMAGE_GEN = 'openai-codex/gpt-5.6-sol';

/** Backends that can actually render images today (Imagine / gpt-image-2). */
const IMAGE_GEN_BACKENDS: ReadonlySet<Backend> = new Set(['codex', 'grok']);

/** True when this model seat can drive `image-gen`. */
export function supportsImageGen(resolved: ResolvedModel): boolean {
  return IMAGE_GEN_BACKENDS.has(resolved.spec.backend);
}

const EFFORTS_SET: ReadonlySet<string> = new Set<Effort>(['low', 'medium', 'high', 'xhigh', 'max']);

/**
 * Resolve a model string (canonical slug, optionally with an effort suffix)
 * to a ResolvedModel spec + effort.
 */
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

/**
 * Compute the backend model ID for preflight and execution.
 * For agy models with reasoning efforts (e.g. gemini-3.6-flash), the effort is appended to the ID.
 */
export function backendModelId(resolved: ResolvedModel): string | undefined {
  if (!resolved.spec.backendModel) {
    return undefined;
  }
  if (resolved.spec.backend === 'agy') {
    const effort = resolved.effort ?? resolved.spec.defaultEffort;
    if (effort) {
      return `${resolved.spec.backendModel}-${effort}`;
    }
  }
  return resolved.spec.backendModel;
}

/**
 * Format model listing lines for CLI help text.
 * Pass `imageOnly: true` to list only seats that can drive `image-gen`.
 */
export function listModelHelpLines(opts: { readonly imageOnly?: boolean } = {}): string[] {
  const lines: string[] = [];
  for (const [slug, spec] of Object.entries(MODELS)) {
    if (opts.imageOnly && !IMAGE_GEN_BACKENDS.has(spec.backend)) continue;
    lines.push(`  ${slug}`);
    lines.push(`    ${spec.brief}`);
  }
  return lines;
}

/**
 * Format error message for unknown model identifier.
 */
export function formatUnknownModelError(input: string): string {
  const lines = [`Unknown model "${input}".`, 'Available models:', ...listModelHelpLines()];
  return lines.join('\n');
}

/**
 * Format error when a known model cannot drive `image-gen` (e.g. gemini/claude).
 */
export function formatImageGenModelError(input: string, resolved: ResolvedModel): string {
  return [
    `Model "${input}" (${resolved.spec.slug}) cannot generate images — backend "${resolved.spec.backend}" has no image path.`,
    'Image-gen seats (canonical slug):',
    ...listModelHelpLines({ imageOnly: true }),
  ].join('\n');
}
