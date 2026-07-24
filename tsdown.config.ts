import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: { cli: 'packages/ai-bridge/src/cli.ts' },
  outDir: 'skills/ai-bridge/scripts',
  fixedExtension: true,
  format: 'esm',
  platform: 'node',
  target: 'node24',
  minify: false,
  dts: false,
  clean: false,
  deps: {
    alwaysBundle: [/^@ai-bridge\//, '@stricli/core'],
    onlyImport: [],
  },
  banner: '// generated — do not edit; rebuild with pnpm build:skill',
});
