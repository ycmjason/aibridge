import { type AgyQuotaSnapshot, fetchAgyQuota, findModelQuota } from '@ai-bridge/agy';
import { type CodexQuotaSnapshot, fetchCodexQuota } from '@ai-bridge/codex';
import { backendModelId, type ResolvedModel } from './models.ts';

export type PreflightVerdict =
  | { readonly ok: true; readonly warning?: string }
  | { readonly ok: false; readonly message: string; readonly resetAt: string | undefined };

export function evaluateAgyPreflight(
  snapshot: AgyQuotaSnapshot,
  backendModel: string,
): PreflightVerdict {
  const quota = findModelQuota(snapshot, backendModel);

  if (!quota) {
    return { ok: true, warning: `model "${backendModel}" not in quota snapshot; proceeding` };
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
    return { ok: false, message: `agy model "${backendModel}" is quota-exhausted`, resetAt };
  }

  return { ok: true };
}

export function evaluateCodexPreflight(snapshot: CodexQuotaSnapshot): PreflightVerdict {
  if (snapshot.limitReached) {
    const resetAt = snapshot.windows.find(w => w.resetAt)?.resetAt;
    return { ok: false, message: 'codex quota limit reached', resetAt };
  }

  const exhaustedWindow = snapshot.windows.find(w => w.usedPercent >= 100);
  if (exhaustedWindow) {
    return { ok: false, message: 'codex quota limit reached', resetAt: exhaustedWindow.resetAt };
  }

  return { ok: true };
}

export async function preflightModel(resolved: ResolvedModel): Promise<PreflightVerdict> {
  if (resolved.spec.backend === 'codex') {
    return preflightCodex();
  }

  if (resolved.spec.backend !== 'agy') {
    return { ok: true };
  }

  try {
    const snapshot = await fetchAgyQuota();
    const modelId = backendModelId(resolved) ?? '';
    return evaluateAgyPreflight(snapshot, modelId);
  } catch (err) {
    return {
      ok: true,
      warning: `quota preflight failed (${(err as Error).message}); proceeding`,
    };
  }
}

export async function preflightCodex(): Promise<PreflightVerdict> {
  try {
    const snapshot = await fetchCodexQuota();
    return evaluateCodexPreflight(snapshot);
  } catch (err) {
    return {
      ok: true,
      warning: `quota preflight failed (${(err as Error).message}); proceeding`,
    };
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

export function renderPreflightRefusal(
  cmd: string,
  verdict: { message: string; resetAt: string | undefined },
): string {
  const resetClause = verdict.resetAt ? ` Resets ${formatReset(verdict.resetAt)}.` : '';
  return `ai-bridge ${cmd}: refusing — ${verdict.message}.${resetClause} Use --no-preflight to override, or a claude-backend fallback (subagent --model sonnet|opus — bills the Claude subscription).`;
}
