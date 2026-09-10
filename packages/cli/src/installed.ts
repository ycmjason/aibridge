import type { Availability } from './driver.ts';
import { getDriver } from './drivers.ts';
import { BACKENDS, type Backend, formatBackends, listModelHelpLines } from './models.ts';

/** Probe result for every backend, installed or not. */
export type Installed = ReadonlyMap<Backend, Availability>;

let cached: Promise<Installed> | undefined;

/** Probes every backend CLI once per process (four `--version` spawns, in parallel). */
export function detectInstalled(): Promise<Installed> {
  cached ??= Promise.all(BACKENDS.map(async b => [b, await getDriver(b).probe()] as const)).then(
    entries => new Map(entries),
  );
  return cached;
}

export function installedBackends(installed: Installed): ReadonlySet<Backend> {
  return new Set(BACKENDS.filter(b => installed.get(b)?.ok));
}

/** Install hints for the absent backends, one line each. */
export function missingLines(installed: Installed): string[] {
  return BACKENDS.flatMap(b => {
    const a = installed.get(b);
    return a && !a.ok ? [`  ${b}: ${a.error.replace(/^aibridge: /, '')}`] : [];
  });
}

/**
 * Fails fast (exit 2) when the seat's backend CLI is missing, before any quota
 * call. Only the target backend is probed on the happy path; the full sweep runs
 * on the error path to list what the caller can use instead.
 */
export async function requireBackend(
  ctx: {
    process: { stderr: { write(chunk: string): unknown }; exitCode: NodeJS.Process['exitCode'] };
  },
  cmd: string,
  backend: Backend,
  opts: { readonly imageOnly?: boolean } = {},
): Promise<boolean> {
  const probe = await getDriver(backend).probe();
  if (probe.ok) return true;
  const all = await detectInstalled();
  const installed = installedBackends(all);
  const lines = [`aibridge ${cmd}: ${probe.error.replace(/^aibridge: /, '')}`];
  if (installed.size > 0) {
    lines.push(
      `Installed backends: ${formatBackends(installed)}. Pick a seat on one of them:`,
      ...listModelHelpLines({ installed, imageOnly: opts.imageOnly }),
    );
  } else {
    lines.push('No backend CLIs found on PATH. Install one of:', ...missingLines(all));
  }
  ctx.process.stderr.write(`${lines.join('\n')}\n`);
  ctx.process.exitCode = 2;
  return false;
}
