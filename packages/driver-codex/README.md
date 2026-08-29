# @aibridge/driver-codex

Driver for the OpenAI Codex CLI. It builds `codex exec` commands with the correct
sandbox mode, enforces version gates, runs delegated tasks, generates and
attributes gpt-image-2 renders, and reads ChatGPT quota windows.

```ts
import { probe, run, generateImage, fetchCodexQuota } from '@aibridge/driver-codex';
```

Requires an authenticated `codex` CLI on `PATH`. Part of the
[aibridge](https://github.com/ycmjason/aibridge) monorepo.

[MIT](https://github.com/ycmjason/aibridge/blob/main/LICENSE)
