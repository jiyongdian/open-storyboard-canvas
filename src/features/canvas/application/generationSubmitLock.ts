const inFlightSubmitKeys = new Set<string>();

export function acquireGenerationSubmitLock(key: string): (() => void) | null {
  const normalizedKey = key.trim();
  if (!normalizedKey || inFlightSubmitKeys.has(normalizedKey)) {
    return null;
  }

  inFlightSubmitKeys.add(normalizedKey);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    inFlightSubmitKeys.delete(normalizedKey);
  };
}

export function generationSubmitLockKey(nodeId: string, surface: string): string {
  return `${nodeId.trim() || 'unknown-node'}:${surface.trim() || 'generation'}`;
}
