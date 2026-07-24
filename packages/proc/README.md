# @aibridge/proc

Process helpers for [aibridge](https://github.com/ycmjason/aibridge) backend drivers: spawn a CLI and capture stdout/stderr with timeout handling (`runCaptured`), probe an executable's availability and version (`probeVersion`), plus small semver and ANSI-stripping utilities.

```ts
import { runCaptured, probeVersion } from '@aibridge/proc';
```

Zero dependencies. Part of the [aibridge](https://github.com/ycmjason/aibridge) monorepo — the agent skill + CLI that lets coding agents drive models from other providers.

[MIT](https://github.com/ycmjason/aibridge/blob/main/LICENSE)
