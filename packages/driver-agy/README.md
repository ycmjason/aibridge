# @aibridge/driver-agy

Antigravity (`agy`) CLI driver for [aibridge](https://github.com/ycmjason/aibridge): build print-mode invocations, probe availability, run delegated tasks (including the answer-file capture protocol), and read Antigravity quota windows.

```ts
import { probe, run, fetchAgyQuota } from '@aibridge/driver-agy';
```

Requires the `agy` CLI on `PATH` and authed. Part of the [aibridge](https://github.com/ycmjason/aibridge) monorepo — the agent skill + CLI that lets coding agents drive models from other providers.

[MIT](https://github.com/ycmjason/aibridge/blob/main/LICENSE)
