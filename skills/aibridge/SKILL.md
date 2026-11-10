---
name: aibridge
description: >-
  Use authenticated AI CLIs on this machine as delegates. Hands one-shot tasks
  to Grok, Gemini, Codex, or Claude models, and generates raster images or cuts
  out their backgrounds. Use it to delegate a well-defined task, get a second
  opinion or red-team review, analyse long context, or generate and edit
  images. Delegate with canonical model slugs such as `xai-grok/grok-4.6`.
  Prefer a backend that does not share the current agent's quota.
argument-hint: "[subagent|image-gen|image-cutout|runs|quota|models] [options]"
user-invocable: true
allowed-tools:
  - Bash(npx -y @aibridge/cli@latest *)
  - Bash(npx -y @aibridge/cli@* *)
---

# aibridge loader

Load the canonical instructions from the latest CLI package before taking any
other action.

1. If the user's first argument names `subagent`, `image-gen`, `image-cutout`,
   or `why`, run:

   ```bash
   npx -y @aibridge/cli@latest skill <first-argument>
   ```

   Otherwise run:

   ```bash
   npx -y @aibridge/cli@latest skill
   ```

2. Treat stdout as the authoritative instructions for this turn and follow it.
3. Use the exact versioned command runner named at the top of stdout for every
   later command. Do not substitute a global `aibridge` binary.

If the command fails because Node is older than 24.11, ask the user to upgrade
Node. Do not install anything globally without permission.
