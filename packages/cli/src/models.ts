/**
 * Canonical model registry and resolution for aibridge.
 *
 * Models are registered by canonical, provider-qualified slug —
 * `<vendor>-<cli>/<model>[-<effort>]`, e.g. `openai-codex/gpt-5.6-sol-high`.
 * Canonical slugs only — no short aliases, by design. That holds on both sides:
 * `backendModel` is a pinned model id (`claude-opus-5`), never a moving vendor
 * alias (`opus`), so a seat never silently changes model under you.
 */

export type Backend = 'agy' | 'claude' | 'codex' | 'grok';
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

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
  'xai-grok/grok-4.5': {
    slug: 'xai-grok/grok-4.5',
    backend: 'grok',
    backendModel: 'grok-4.5',
    efforts: ['low', 'medium', 'high'],
    brief: 'xAI Grok 4.5 via grok CLI — default for plan & review; own xAI login',
  },
  'google-antigravity/gemini-3.6-flash': {
    slug: 'google-antigravity/gemini-3.6-flash',
    backend: 'agy',
    backendModel: 'gemini-3.6-flash',
    efforts: ['low', 'medium', 'high'],
    defaultEffort: 'high',
    brief:
      'Google Gemini 3.6 Flash via agy — default for implement, also image-gen; own Antigravity login',
  },
  'google-antigravity/claude-sonnet-4-6': {
    slug: 'google-antigravity/claude-sonnet-4-6',
    backend: 'agy',
    backendModel: 'claude-sonnet-4-6',
    efforts: null,
    brief: 'Claude Sonnet 4.6 (thinking) via agy — own Antigravity login',
  },
  'google-antigravity/claude-opus-4-6-thinking': {
    slug: 'google-antigravity/claude-opus-4-6-thinking',
    backend: 'agy',
    backendModel: 'claude-opus-4-6-thinking',
    efforts: null,
    brief: 'Claude Opus 4.6 (thinking) via agy — own Antigravity login; heavyweight',
  },
  'google-antigravity/gpt-oss-120b-medium': {
    slug: 'google-antigravity/gpt-oss-120b-medium',
    backend: 'agy',
    backendModel: 'gpt-oss-120b-medium',
    efforts: null,
    brief: 'GPT-OSS 120B (medium) via agy — own Antigravity login',
  },
  'openai-codex/gpt-5.6-sol': {
    slug: 'openai-codex/gpt-5.6-sol',
    backend: 'codex',
    backendModel: 'gpt-5.6-sol',
    efforts: ['low', 'medium', 'high', 'xhigh'],
    brief: 'OpenAI Codex gpt-5.6-sol via codex CLI',
  },
  'anthropic-claude/sonnet-5': {
    slug: 'anthropic-claude/sonnet-5',
    backend: 'claude',
    backendModel: 'claude-sonnet-5',
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    brief: 'Claude Sonnet 5 via claude CLI — bills your Claude subscription',
  },
  'anthropic-claude/opus-5': {
    slug: 'anthropic-claude/opus-5',
    backend: 'claude',
    backendModel: 'claude-opus-5',
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    defaultEffort: 'high',
    brief: 'Claude Opus 5 via claude CLI (default effort: high) — bills subscription',
  },
  'anthropic-claude/opus-5-1m': {
    slug: 'anthropic-claude/opus-5-1m',
    backend: 'claude',
    backendModel: 'claude-opus-5[1m]',
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    defaultEffort: 'high',
    brief: 'Claude Opus 5, 1M context via claude CLI — long-context work; bills subscription',
  },
} as const satisfies Record<string, ModelSpec>;

export const DEFAULT_MODEL = 'xai-grok/grok-4.5';
export const DEFAULT_IMPLEMENTER = 'google-antigravity/gemini-3.6-flash';
export const DEFAULT_IMAGE_GEN = 'openai-codex/gpt-5.6-sol';

const IMAGE_GEN_BACKENDS: ReadonlySet<Backend> = new Set(['agy', 'codex', 'grok']);

export function supportsImageGen(resolved: ResolvedModel): boolean {
  return IMAGE_GEN_BACKENDS.has(resolved.spec.backend);
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

export function listModelHelpLines(opts: { readonly imageOnly?: boolean } = {}): string[] {
  const lines: string[] = [];
  for (const [slug, spec] of Object.entries(MODELS)) {
    if (opts.imageOnly && !IMAGE_GEN_BACKENDS.has(spec.backend)) continue;
    lines.push(`  ${slug}`);
    lines.push(`    ${spec.brief}`);
  }
  return lines;
}

export function formatUnknownModelError(input: string): string {
  const lines = [`Unknown model "${input}".`, 'Available models:', ...listModelHelpLines()];
  return lines.join('\n');
}

export function formatImageGenModelError(input: string, resolved: ResolvedModel): string {
  return [
    `Model "${input}" (${resolved.spec.slug}) cannot generate images — backend "${resolved.spec.backend}" has no image path.`,
    'Image-gen seats (canonical slug):',
    ...listModelHelpLines({ imageOnly: true }),
  ].join('\n');
}
