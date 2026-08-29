# @aibridge/driver-grok

Driver for Grok. It builds print-mode CLI commands, checks availability, runs
delegated tasks, and generates images through the xAI API.

```ts
import { probe, run, generateImage } from '@aibridge/driver-grok';
```

Delegation requires an authenticated `grok` CLI on `PATH`. `generateImage`
instead calls `api.x.ai` with the token from `~/.grok/auth.json`; it starts the
CLI only to refresh an expiring or rejected token. Part of the
[aibridge](https://github.com/ycmjason/aibridge) monorepo.

[MIT](https://github.com/ycmjason/aibridge/blob/main/LICENSE)
