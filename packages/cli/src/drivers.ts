import * as agy from '@aibridge/driver-agy';
import * as claude from '@aibridge/driver-claude';
import * as codex from '@aibridge/driver-codex';
import * as grok from '@aibridge/driver-grok';
import type { AgentCliDriver } from './driver.ts';
import type { Backend } from './models.ts';

const agyDriver: AgentCliDriver = {
  probe: () => agy.probe(),
  run: task => agy.run(task),
  quota: () => agy.fetchAgyQuota(),
  generateImage: req => agy.generateImage(req),
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
