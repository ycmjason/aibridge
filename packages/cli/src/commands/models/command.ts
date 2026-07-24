import { buildCommand } from '@stricli/core';
import modelsImpl from './impl.ts';

export const models = buildCommand({
  func: modelsImpl,
  parameters: {
    flags: {
      json: {
        kind: 'boolean',
        withNegated: false,
        brief: 'Emit the registry as JSON',
      },
    },
  },
  docs: {
    brief: 'List every model seat in the registry (slug, efforts, image format)',
  },
});
