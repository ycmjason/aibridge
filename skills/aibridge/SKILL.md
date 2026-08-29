---
name: aibridge
description: >-
  Use authenticated AI CLIs on this machine as delegates. Supports one-shot
  tasks, cross-model review, a plan → implement → review workflow, and raster
  image generation through Grok, Gemini, Codex, or Claude seats. Use it for
  well-defined delegation, sizeable or risky implementation, second opinions,
  red-team review, long-context analysis, and image generation or editing.
  Delegate with canonical model slugs such as `xai-grok/grok-4.6` and pass plan
  file paths—not their contents—between stages. Prefer a backend that does not
  share the current agent's quota.
argument-hint: "[plan|implement|review|subagent|image-gen|runs|quota] [options]"
user-invocable: true
allowed-tools:
  - Bash(npx -y @aibridge/cli@latest *)
  - Bash(npx -y @aibridge/cli@* *)
---

# aibridge loader

Load the canonical instructions from the latest CLI package before taking any
other action.

1. If the user's first argument names `plan`, `implement`, `review`, `subagent`,
   `image-gen`, or `why`, run:

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
