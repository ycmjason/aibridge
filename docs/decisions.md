# Architecture & decisions

> Working log since 2026-06-08. Operational backend facts live in [`backends.md`](backends.md); current dev docs in [`AGENTS.md`](../AGENTS.md).

## Active decisions

- **Skill + CLI, not an MCP server.** The skill carries judgment/prompt-craft as on-demand context; the CLI owns brittle execution. MCP's ~60s default tool timeout fights multi-minute delegations, and cross-client reuse wasn't needed. If another surface ever needs these tools, wrap this same CLI in a thin MCP server.
- **Two-step distribution** (2026-07-24): `@aibridge/*` packages on npm + a prose-only skill that runs `npx -y @aibridge/cli` zero-install. Transparency (users see exactly what's installed), standard skill-wraps-a-CLI pattern, and it deleted the entire committed-bundle gate apparatus.
- **OIDC version-triggered publishing** (modeled on fishballapp/acme): bump a package version, merge to main → `publish.yml` verify job (full gates + pack/consumer smoke) then OIDC publish with provenance, skip-if-exists. First-ever publish of a NEW package needs a one-time manual bootstrap + Trusted Publisher config.
- **Monorepo layout**: `packages/proc` (spawn/capture) ← `packages/driver-{agy,grok,codex,claude}` (per-CLI drivers: args, capture protocol, quota, probe) ← `packages/cli` (stricli app, models registry, backend-switch-free delegate). Structural `AgentCliDriver` contract (`probe`/`run`/`quota?`/`generateImage?`) defined in the cli package; drivers conform structurally — no shared contracts package. `AGY_CANONICAL_TO_NATIVE` lives in `driver-agy` to avoid a dependency cycle.
- **`@stricli/core` for command orchestration** — typed `buildCommand` routing, generated help; exit-code contract (0 ok / 1 operational / 2 bad args / 3 quota refusal) preserved by normalizing stricli's framework codes post-`run`, locked by in-process tests on both the dev entry and published bin.
- **Canonical model slugs** `<vendor>-<cli>/<model>[-<effort>]`, no aliases; effort maps to each backend's own knob. Registry in `packages/cli/src/models.ts`.
- **Cross-model seats**: grok plans/reviews, gemini implements — a model never reviews its own diff.
- **Node ≥24.11, native TS dev loop** — packages' `exports` point at `src/*.ts`; Node runs workspace-linked TS directly (no build in dev). Erasable syntax only; tsdown builds `dist/` for publishing; `prepack` self-builds.

## History (superseded, kept as one-liners)

- *Welded plan gate* (one recursive codex call doing review+expand+build) → replaced by the decoupled `plan` → `implement` → `review` flow with the orchestrator approving the plan file between stages (2026-07-24).
- *Zero-dependency `node:util parseArgs` CLI inside the skill dir* → stricli + npm packages once bundling/publishing removed the zero-dep constraint (2026-07-24). Same change: `review` now rejects stray positionals (exit 2); stricli's additive flag spellings (`--flag=value`, `--help-all`) accepted.
- *Committed self-contained skill bundle* (`skills/aibridge/scripts/cli.mjs` + freshness/bare-copy/import.meta CI gates) → two-step npm distribution (2026-07-24).
- *Original repo/scope names* `fishballapp/ai-bridge`, `@ai-bridge/*`, `@aibridge/{agy,…}` → `ycmjason/aibridge`, `@aibridge/*`, `@aibridge/driver-*` (2026-07-24).
