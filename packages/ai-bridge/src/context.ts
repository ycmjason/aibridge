export interface LocalContext {
  readonly process: NodeJS.Process;
}

export function buildContext(process: NodeJS.Process): LocalContext {
  return { process };
}
