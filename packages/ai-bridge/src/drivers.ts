import * as agy from '@ai-bridge/agy';
import * as claude from '@ai-bridge/claude';
import * as codex from '@ai-bridge/codex';
import * as grok from '@ai-bridge/grok';
import type { AgentCliDriver } from './driver.ts';
import type { Backend } from './models.ts';

const agyDriver: AgentCliDriver = {
  probe: () => agy.probe(),
  run: task => agy.run(task),
  quota: () => agy.fetchAgyQuota(),
};

const grokDriver: AgentCliDriver = {
  probe: () => grok.probe(),
  run: task => grok.run(task),
  generateImage: req => grok.generateImage(req),
};

const codexDriver: AgentCliDriver = {
  probe: () => codex.probe(),
  run: task => codex.run(task),
  quota: () => codex.fetchCodexQuota(),
  generateImage: req => codex.generateImage(req),
};

const claudeDriver: AgentCliDriver = {
  probe: () => claude.probe(),
  run: task => claude.run(task),
  quota: () => claude.fetchClaudeQuota(),
};

const DRIVERS: Record<Backend, AgentCliDriver> = {
  agy: agyDriver,
  grok: grokDriver,
  codex: codexDriver,
  claude: claudeDriver,
};

export function getDriver(backend: Backend): AgentCliDriver {
  const driver = DRIVERS[backend];
  if (!driver) throw new Error(`Unknown backend "${backend}"`);
  return driver;
}
