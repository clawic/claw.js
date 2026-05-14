export function mergeProcessEnv(...envs: Array<Record<string, string | undefined> | undefined>): NodeJS.ProcessEnv {
  const merged = {} as NodeJS.ProcessEnv;
  for (const env of envs) {
    if (!env) continue;
    for (const [key, value] of Object.entries(env)) {
      if (value !== undefined) {
        merged[key] = value;
      }
    }
  }
  return merged;
}
