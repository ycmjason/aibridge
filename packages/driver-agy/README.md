# @aibridge/driver-agy

Driver for the Antigravity (`agy`) CLI. It builds print-mode commands, checks
availability, runs delegated tasks, captures answer files, and reads quota
windows.

```ts
import { probe, run, fetchAgyQuota } from '@aibridge/driver-agy';
```

Requires an authenticated `agy` CLI on `PATH`. Part of the
[aibridge](https://github.com/ycmjason/aibridge) monorepo.

[MIT](https://github.com/ycmjason/aibridge/blob/main/LICENSE)
