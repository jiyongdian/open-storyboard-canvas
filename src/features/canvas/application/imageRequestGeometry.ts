export interface NormalizeImageRequestGeometryInput {
  selectedResolution?: unknown;
  selectedAspectRatio?: unknown;
  referenceAspectRatio?: unknown;
  supportedAspectRatios?: readonly string[];
  fallbackAspectRatio?: string;
  fallbackResolution?: string;
}

export interface NormalizedImageRequestGeometry {
  requestSize: string;
  requestAspectRatio: string;
  promptAspectRatio: string;
  resolutionLabel: string;
  ratioSource: 'pixel-size' | 'explicit' | 'reference' | 'fallback';
  warning?: string;
}

const PIXEL_SIZE_PATTERN = /^(\d{2,5})\s*[x×]\s*(\d{2,5})$/i;
const AUTO_RATIO_PATTERN = /^(auto|smart|智能|自动)$/i;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function greatestCommonDivisor(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y !== 0) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x || 1;
}

function pixelRatio(value: string): string | null {
  const match = PIXEL_SIZE_PATTERN.exec(value);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const divisor = greatestCommonDivisor(width, height);
  return `${width / divisor}:${height / divisor}`;
}

function ratioValue(value: string): number | null {
  const match = /^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/.exec(value);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
    ? width / height
    : null;
}

function normalizedSupportedRatios(values: readonly string[] | undefined): string[] {
  return Array.from(new Set((values ?? [])
    .map((value) => value.trim())
    .filter((value) => value && !AUTO_RATIO_PATTERN.test(value) && ratioValue(value) !== null)));
}

function nearestSupportedRatio(reference: string, supported: readonly string[]): string | null {
  const target = ratioValue(reference);
  if (target === null) return null;
  let best: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of supported) {
    const candidateValue = ratioValue(candidate);
    if (candidateValue === null) continue;
    const distance = Math.abs(Math.log(candidateValue / target));
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

export function normalizeImageRequestGeometry(
  input: NormalizeImageRequestGeometryInput,
): NormalizedImageRequestGeometry {
  const fallbackResolution = text(input.fallbackResolution) || '2K';
  const selectedResolution = text(input.selectedResolution) || fallbackResolution;
  const explicitPixelRatio = pixelRatio(selectedResolution);
  if (explicitPixelRatio) {
    return {
      requestSize: selectedResolution.replace('×', 'x'),
      requestAspectRatio: 'auto',
      promptAspectRatio: explicitPixelRatio,
      resolutionLabel: selectedResolution.replace('×', 'x'),
      ratioSource: 'pixel-size',
    };
  }

  const selectedRatio = text(input.selectedAspectRatio);
  if (selectedRatio && !AUTO_RATIO_PATTERN.test(selectedRatio) && ratioValue(selectedRatio) !== null) {
    return {
      requestSize: selectedResolution,
      requestAspectRatio: selectedRatio,
      promptAspectRatio: selectedRatio,
      resolutionLabel: selectedResolution,
      ratioSource: 'explicit',
    };
  }

  const supported = normalizedSupportedRatios(input.supportedAspectRatios);
  const reference = text(input.referenceAspectRatio);
  const mappedReference = nearestSupportedRatio(reference, supported);
  if (mappedReference) {
    return {
      requestSize: selectedResolution,
      requestAspectRatio: mappedReference,
      promptAspectRatio: mappedReference,
      resolutionLabel: selectedResolution,
      ratioSource: 'reference',
    };
  }

  const fallback = text(input.fallbackAspectRatio) || supported[0] || '1:1';
  return {
    requestSize: selectedResolution,
    requestAspectRatio: fallback,
    promptAspectRatio: fallback,
    resolutionLabel: selectedResolution,
    ratioSource: 'fallback',
    warning: reference ? `Unsupported reference aspect ratio: ${reference}` : undefined,
  };
}
