# @aibridge/driver-codex

OpenAI Codex CLI driver for [aibridge](https://github.com/ycmjason/aibridge): build `codex exec` invocations with sandbox/approval modes, probe availability with version gates, run delegated tasks, generate images with gpt-image-2 (including render attribution), and read ChatGPT quota windows.

```ts
import { probe, run, generateImage, fetchCodexQuota } from '@aibridge/driver-codex';
```

Requires the `codex` CLI on `PATH` and authed. Part of the [aibridge](https://github.com/ycmjason/aibridge) monorepo — the agent skill + CLI that lets coding agents drive models from other providers.

[MIT](https://github.com/ycmjason/aibridge/blob/main/LICENSE)
