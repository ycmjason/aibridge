# @aibridge/driver-grok

xAI Grok CLI driver for [aibridge](https://github.com/ycmjason/aibridge): build print-mode invocations, probe availability, run delegated tasks, and generate images through Grok Imagine.

```ts
import { probe, run, generateImage } from '@aibridge/driver-grok';
```

Requires the `grok` CLI on `PATH` and authed, except `generateImage`, which POSTs `api.x.ai` with the bearer from `~/.grok/auth.json` and reaches the CLI only to refresh an expiring or rejected token. Part of the [aibridge](https://github.com/ycmjason/aibridge) monorepo — the agent skill + CLI that lets coding agents drive models from other providers.

[MIT](https://github.com/ycmjason/aibridge/blob/main/LICENSE)
