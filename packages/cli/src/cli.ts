#!/usr/bin/env node
import { runCli } from './app.ts';
import { buildContext } from './context.ts';

await runCli(buildContext(process), process.argv.slice(2));
