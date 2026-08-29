# @aibridge/driver-claude

Driver for the Claude CLI. It builds print-mode commands, maps effort levels,
checks availability, runs delegated tasks, and reads subscription quota windows.

```ts
import { probe, run, fetchClaudeQuota } from '@aibridge/driver-claude';
```

Requires an authenticated `claude` CLI on `PATH`. Part of the
[aibridge](https://github.com/ycmjason/aibridge) monorepo.

[MIT](https://github.com/ycmjason/aibridge/blob/main/LICENSE)
