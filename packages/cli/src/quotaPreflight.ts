import { type AgyQuotaSnapshot, fetchAgyQuota, findModelQuota } from '@aibridge/driver-agy';
import { type CodexQuotaSnapshot, fetchCodexQuota } from '@aibridge/driver-codex';
import { fetchGrokQuota, type GrokQuotaSnapshot } from '@aibridge/driver-grok';
import { isAuthExpired } from '@aibridge/proc';
import { type Backend, backendModelId, listModels, type ResolvedModel } from './models.ts';

export type PreflightVerdict =
  | { readonly ok: true; readonly warning?: string }
  | {
      readonly ok: false;
      readonly kind: 'auth' | 'quota';
      readonly message: string;
      readonly resetAt: string | undefined;
    };

export function evaluateAgyPreflight(
  snapshot: AgyQuotaSnapshot,
  backendModel: string,
): PreflightVerdict {
  const quota = findModelQuota(snapshot, backendModel);

  if (!quota) {
    // agy does not itemise every Gemini id (the orchestrators); those draw on
    // the shared Gemini group, so its windows are the guard.
    const group = backendModel.startsWith('gemini-')
      ? snapshot.groups.find(g => g.displayName.includes('Gemini'))
      : undefined;
    if (!group) {
      return { ok: true, warning: `model "${backendModel}" not in quota snapshot; proceeding` };
    }
    const spent = group.buckets.filter(b => b.remainingFraction <= 0);
    if (spent.length === 0) return { ok: true };
    // Usable again only once every spent window has reset.
    const resets = spent.map(b => b.resetTime).filter(t => t !== undefined);
    return {
      ok: false,
      kind: 'quota',
      message: `agy "${group.displayName}" quota is exhausted (model "${backendModel}" draws on it)`,
      resetAt: resets.length === spent.length ? resets.sort().at(-1) : undefined,
    };
  }

  if (quota.exhausted) {
    let resetAt = quota.resetTime;
    if (!resetAt) {
      for (const group of snapshot.groups) {
        if (group.displayName.includes('Gemini')) {
          for (const bucket of group.buckets) {
            if (bucket.resetTime) {
              if (!resetAt || new Date(bucket.resetTime).getTime() < new Date(resetAt).getTime()) {
                resetAt = bucket.resetTime;
              }
            }
          }
        }
      }
    }
    return {
      ok: false,
      kind: 'quota',
      message: `agy model "${backendModel}" is quota-exhausted`,
      resetAt,
    };
  }

  return { ok: true };
}

export function evaluateCodexPreflight(snapshot: CodexQuotaSnapshot): PreflightVerdict {
  if (snapshot.limitReached) {
    const resetAt = snapshot.windows.find(w => w.resetAt)?.resetAt;
    return { ok: false, kind: 'quota', message: 'codex quota limit reached', resetAt };
  }

  const exhaustedWindow = snapshot.windows.find(w => w.usedPercent >= 100);
  if (exhaustedWindow) {
    return {
      ok: false,
      kind: 'quota',
      message: 'codex quota limit reached',
      resetAt: exhaustedWindow.resetAt,
    };
  }

  return { ok: true };
}

export function evaluateGrokPreflight(snapshot: GrokQuotaSnapshot): PreflightVerdict {
  if (snapshot.usedPercent !== undefined && snapshot.usedPercent >= 100) {
    return {
      ok: false,
      kind: 'quota',
      message: 'grok credit quota exhausted',
      resetAt: snapshot.periodEnd,
    };
  }

  return { ok: true };
}

export async function preflightModel(resolved: ResolvedModel): Promise<PreflightVerdict> {
  if (resolved.spec.backend === 'codex') {
    return preflightCodex();
  }

  if (resolved.spec.backend === 'grok') {
    return preflightGrok();
  }

  if (resolved.spec.backend !== 'agy') {
    return { ok: true };
  }

  try {
    const snapshot = await fetchAgyQuota();
    return evaluateAgyPreflight(snapshot, backendModelId(resolved));
  } catch (err) {
    if (isAuthExpired(err))
      return { ok: false, kind: 'auth', message: err.message, resetAt: undefined };
    return { ok: true, warning: `quota preflight failed (${(err as Error).message}); proceeding` };
  }
}

export async function preflightCodex(): Promise<PreflightVerdict> {
  try {
    const snapshot = await fetchCodexQuota();
    return evaluateCodexPreflight(snapshot);
  } catch (err) {
    if (isAuthExpired(err))
      return { ok: false, kind: 'auth', message: err.message, resetAt: undefined };
    return { ok: true, warning: `quota preflight failed (${(err as Error).message}); proceeding` };
  }
}

export async function preflightGrok(): Promise<PreflightVerdict> {
  try {
    const snapshot = await fetchGrokQuota();
    return evaluateGrokPreflight(snapshot);
  } catch (err) {
    if (isAuthExpired(err))
      return { ok: false, kind: 'auth', message: err.message, resetAt: undefined };
    return { ok: true, warning: `quota preflight failed (${(err as Error).message}); proceeding` };
  }
}

function formatReset(resetTime: string | undefined): string {
  if (!resetTime) return '-';
  const ms = new Date(resetTime).getTime() - Date.now();
  if (Number.isNaN(ms)) return resetTime;
  if (ms <= 0) return 'now';
  const mins = Math.round(ms / 60_000);
  const rel = mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h${mins % 60}m`;
  return `${new Date(resetTime).toLocaleTimeString()} (in ${rel})`;
}

/** Models on other installed backends to name when refusing `model`. */
export function alternativeModels(
  model: ResolvedModel,
  installed: ReadonlySet<Backend>,
  imageOnly = false,
): string[] {
  return listModels({ installed, imageOnly })
    .filter(s => s.backend !== model.spec.backend)
    .map(s => s.slug)
    .slice(0, 3);
}

export function renderPreflightRefusal(
  cmd: string,
  verdict: { kind: 'auth' | 'quota'; message: string; resetAt: string | undefined },
  alternatives: readonly string[],
): string {
  if (verdict.kind === 'auth') {
    // "the delegate" was wrong for image-gen, which has no delegate — the grok
    // model is a direct API call. Verified: --no-preflight there just fails at
    // the render with exit 1.
    return `aibridge ${cmd}: refusing — ${verdict.message}. Running with --no-preflight would only fail unauthenticated later. Or use a different --model.`;
  }
  const resetClause = verdict.resetAt ? ` Resets ${formatReset(verdict.resetAt)}.` : '';
  const fallback =
    alternatives.length > 0
      ? `Use --no-preflight to override, or another installed model (--model ${alternatives.join(' | ')}).`
      : 'Use --no-preflight to override; no other backend CLI is installed to fall back to.';
  return `aibridge ${cmd}: refusing — ${verdict.message}.${resetClause} ${fallback}`;
}
