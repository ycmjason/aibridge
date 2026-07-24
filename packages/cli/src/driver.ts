import type { AgyQuotaSnapshot } from '@aibridge/driver-agy';
import type { ClaudeQuotaSnapshot } from '@aibridge/driver-claude';
import type { CodexQuotaSnapshot } from '@aibridge/driver-codex';
import type { Effort } from './models.ts';

export type Availability =
  | { readonly ok: true; readonly version: string }
  | { readonly ok: false; readonly error: string };

export interface DelegationTask {
  readonly prompt: string;
  readonly tools: boolean;
  readonly timeoutSec: number;
  readonly cwd: string;
  readonly backendModel: string;
  readonly effort: Effort | undefined;
  readonly onStdout?: (chunk: string) => void;
  readonly onStderr?: (chunk: string) => void;
  readonly onSpawn?: (pid: number) => void;
}

export type DelegationResult =
  | { readonly ok: true; readonly response: string; readonly exitCode: number }
  | {
      readonly ok: false;
      readonly kind: 'not-found' | 'spawn' | 'timeout' | 'no-answer';
      readonly message: string;
      readonly exitCode: number | null;
    };

export type QuotaSnapshot = AgyQuotaSnapshot | CodexQuotaSnapshot | ClaudeQuotaSnapshot;

export interface ImageGenRequest {
  readonly prompt: string;
  readonly workDir: string;
  readonly backendModel: string;
  readonly effort: Effort | undefined;
  readonly quality: string;
  readonly size: { readonly w: number; readonly h: number } | undefined;
  readonly imagePaths: readonly string[];
  readonly timeoutSec: number;
  readonly forceful: boolean;
  readonly minBytes: number;
}

export type ImageResult =
  | { readonly kind: 'ok'; readonly path: string; readonly bytes: number }
  | { readonly kind: 'suspect' }
  | { readonly kind: 'error'; readonly reason: string };

export interface AgentCliDriver {
  probe(): Promise<Availability>;
  run(task: DelegationTask): Promise<DelegationResult>;
  quota?(): Promise<QuotaSnapshot>;
  generateImage?(req: ImageGenRequest): Promise<ImageResult>;
}
