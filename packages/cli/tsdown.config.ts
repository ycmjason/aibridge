import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: { cli: 'src/cli.ts' },
  outDir: '../../skills/ai-bridge/scripts',
  fixedExtension: true,
  format: 'esm',
  platform: 'node',
  target: 'node24',
  minify: false,
  dts: false,
  clean: false,
  // Everything is a devDependency, so tsdown's default (externalize only
  // dependencies/peerDependencies) inlines the whole tree; onlyImport: []
  // still fails the build if a bare non-builtin import ever leaks out.
  deps: {
    onlyImport: [],
  },
  banner: '// generated — do not edit; rebuild with pnpm build:skill',
});
