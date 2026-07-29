import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { AuthExpiredError } from '@aibridge/proc';
import { probeGrokAuth } from './grok.ts';

export interface GrokQuotaProduct {
  readonly product: string;
  readonly usedPercent: number;
}

export interface GrokQuotaSnapshot {
  readonly fetchedAt: string;
  readonly periodType: string | undefined;
  readonly periodStart: string | undefined;
  readonly periodEnd: string | undefined;
  readonly usedPercent: number | undefined;
  readonly products: readonly GrokQuotaProduct[];
  readonly onDemandUsedCents: number | undefined;
  readonly onDemandCapCents: number | undefined;
  readonly prepaidBalanceCents: number | undefined;
}

interface RawCent {
  val?: number;
}

interface RawProductUsage {
  product?: string;
  usagePercent?: number;
}

interface RawPeriod {
  type?: string;
  start?: string;
  end?: string;
}

export interface RawGrokBilling {
  config?: {
    currentPeriod?: RawPeriod;
    creditUsagePercent?: number;
    monthlyLimit?: RawCent;
    used?: RawCent;
    onDemandCap?: RawCent;
    onDemandUsed?: RawCent;
    productUsage?: RawProductUsage[];
    prepaidBalance?: RawCent;
    billingPeriodStart?: string;
    billingPeriodEnd?: string;
  };
}

export function grokAuthPath(): string {
  return process.env.GROK_AUTH_PATH ?? join(homedir(), '.grok', 'auth.json');
}

function parseCent(obj: RawCent | undefined): number | undefined {
  if (obj === undefined) return undefined;
  return typeof obj.val === 'number' ? obj.val : 0;
}

export function parseGrokBilling(data: RawGrokBilling): GrokQuotaSnapshot {
  const config = data.config;

  let usedPercent: number | undefined;
  if (typeof config?.creditUsagePercent === 'number') {
    usedPercent = config.creditUsagePercent;
  } else if (
    typeof config?.used?.val === 'number' &&
    typeof config?.monthlyLimit?.val === 'number' &&
    config.monthlyLimit.val > 0
  ) {
    usedPercent = Math.round((config.used.val / config.monthlyLimit.val) * 1000) / 10;
  }

  const rawPeriodType = config?.currentPeriod?.type;
  const periodType = rawPeriodType
    ? rawPeriodType.replace(/^USAGE_PERIOD_TYPE_/, '').toLowerCase()
    : undefined;

  const periodStart = config?.currentPeriod?.start ?? config?.billingPeriodStart;
  const periodEnd = config?.currentPeriod?.end ?? config?.billingPeriodEnd;

  const products: GrokQuotaProduct[] = (config?.productUsage ?? []).map(p => ({
    product: p.product ?? '',
    usedPercent: typeof p.usagePercent === 'number' ? p.usagePercent : 0,
  }));

  return {
    fetchedAt: new Date().toISOString(),
    periodType,
    periodStart,
    periodEnd,
    usedPercent,
    products,
    onDemandUsedCents: parseCent(config?.onDemandUsed),
    onDemandCapCents: parseCent(config?.onDemandCap),
    prepaidBalanceCents: parseCent(config?.prepaidBalance),
  };
}

interface GrokAuthRecord {
  key?: string;
  user_id?: string;
}

async function requestBilling(fetchImpl: typeof fetch): Promise<Response> {
  const authPath = grokAuthPath();
  let rawAuth: string;
  try {
    rawAuth = readFileSync(authPath, 'utf8');
  } catch (_err) {
    throw new AuthExpiredError('grok auth.json has no usable session (run `grok login`)');
  }

  let authData: Record<string, GrokAuthRecord>;
  try {
    authData = JSON.parse(rawAuth) as Record<string, GrokAuthRecord>;
  } catch (_err) {
    throw new AuthExpiredError('grok auth.json has no usable session (run `grok login`)');
  }

  let record: GrokAuthRecord | undefined;
  for (const [key, value] of Object.entries(authData)) {
    if (key.startsWith('https://auth.x.ai::')) {
      record = value;
      break;
    }
  }
  if (!record) {
    const firstKey = Object.keys(authData)[0];
    if (firstKey) {
      record = authData[firstKey];
    }
  }

  if (!record?.key) {
    throw new AuthExpiredError('grok auth.json has no usable session (run `grok login`)');
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${record.key}`,
    'X-XAI-Token-Auth': 'xai-grok-cli',
    'x-grok-client-mode': 'headless',
  };

  if (record.user_id) {
    headers['x-userid'] = record.user_id;
  }

  try {
    const versionPath = join(dirname(authPath), 'version.json');
    const versionRaw = readFileSync(versionPath, 'utf8');
    const versionData = JSON.parse(versionRaw) as { version?: string };
    if (typeof versionData.version === 'string') {
      headers['x-grok-client-version'] = versionData.version;
    }
  } catch {
    // If unreadable, omit the x-grok-client-version header
  }

  return fetchImpl('https://cli-chat-proxy.grok.com/v1/billing?format=credits', {
    headers,
  });
}

export async function fetchGrokQuota(
  fetchImpl: typeof fetch = fetch,
  refresh: () => Promise<unknown> = probeGrokAuth,
): Promise<GrokQuotaSnapshot> {
  let res = await requestBilling(fetchImpl);
  if (res.status === 401) {
    await refresh();
    res = await requestBilling(fetchImpl);
  }
  if (res.status === 401) {
    throw new AuthExpiredError('grok session expired (401) — run `grok login`, then retry');
  }
  if (!res.ok) {
    throw new Error(`grok billing endpoint failed: HTTP ${res.status}`);
  }

  return parseGrokBilling((await res.json()) as RawGrokBilling);
}
