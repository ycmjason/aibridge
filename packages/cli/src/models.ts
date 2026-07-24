/**
 * Canonical model registry and resolution for aibridge.
 *
 * Models are registered by canonical, provider-qualified slug —
 * `<vendor>-<cli>/<model>[-<effort>]`, e.g. `openai-codex/gpt-5.6-sol-high`.
 * Canonical slugs only — no short aliases, by design. That holds on both sides:
 * `backendModel` is a pinned model id (`claude-sonnet-5`), never a moving vendor
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
    brief: 'xAI Grok 4.5 via grok CLI — own xAI login; ~30 req/min, ~1k msgs/day, single-flight',
  },
  'google-antigravity/gemini-3.6-flash': {
    slug: 'google-antigravity/gemini-3.6-flash',
    backend: 'agy',
    backendModel: 'gemini-3.6-flash',
    efforts: ['low', 'medium', 'high'],
    defaultEffort: 'high',
    brief:
      'Google Gemini 3.6 Flash via agy — own Antigravity login; quota shared across all Gemini tiers',
  },
  'google-antigravity/gemini-3.1-pro': {
    slug: 'google-antigravity/gemini-3.1-pro',
    backend: 'agy',
    // agy exposes only -high and -low for this class — there is no medium tier.
    efforts: ['low', 'high'],
    backendModel: 'gemini-3.1-pro',
    defaultEffort: 'high',
    brief:
      'Google Gemini 3.1 Pro via agy — own Antigravity login; quota shared across all Gemini tiers',
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
    brief: 'OpenAI gpt-5.6-sol via codex CLI — frontier agentic coding; own ChatGPT login',
  },
  'openai-codex/gpt-5.6-terra': {
    slug: 'openai-codex/gpt-5.6-terra',
    backend: 'codex',
    backendModel: 'gpt-5.6-terra',
    efforts: ['low', 'medium', 'high', 'xhigh'],
    brief: 'OpenAI gpt-5.6-terra via codex CLI — balanced, everyday coding; own ChatGPT login',
  },
  'openai-codex/gpt-5.6-luna': {
    slug: 'openai-codex/gpt-5.6-luna',
    backend: 'codex',
    backendModel: 'gpt-5.6-luna',
    efforts: ['low', 'medium', 'high', 'xhigh'],
    brief: 'OpenAI gpt-5.6-luna via codex CLI — fast and affordable coding; own ChatGPT login',
  },
  'anthropic-claude/fable-5': {
    slug: 'anthropic-claude/fable-5',
    backend: 'claude',
    backendModel: 'claude-fable-5',
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    defaultEffort: 'high',
    brief:
      'Claude Fable 5 via claude CLI — hardest, longest-running work; bills the claude CLI subscription',
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
  'anthropic-claude/haiku-4-5': {
    slug: 'anthropic-claude/haiku-4-5',
    backend: 'claude',
    backendModel: 'claude-haiku-4-5-20251001',
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    brief: 'Claude Haiku 4.5 via claude CLI — quick answers; bills the claude CLI subscription',
  },
} as const satisfies Record<string, ModelSpec>;

export type ImageFormat = 'jpg' | 'png';

const IMAGE_GEN_FORMATS: ReadonlyMap<Backend, ImageFormat> = new Map([
  ['agy', 'jpg'],
  ['codex', 'png'],
  ['grok', 'jpg'],
]);

export function supportsImageGen(resolved: ResolvedModel): boolean {
  return IMAGE_GEN_FORMATS.has(resolved.spec.backend);
}

export function imageFormatFor(resolved: ResolvedModel): ImageFormat | undefined {
  return IMAGE_GEN_FORMATS.get(resolved.spec.backend);
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
    if (opts.imageOnly && !IMAGE_GEN_FORMATS.has(spec.backend)) continue;
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
