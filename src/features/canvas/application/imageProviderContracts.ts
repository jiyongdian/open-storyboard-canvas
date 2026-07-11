export interface ParsedCustomProviderModelId {
  providerId: string;
  upstreamModel: string;
}

export interface ImageResultCandidate {
  source: string;
  path: string;
  confidence: 'explicit' | 'known-format' | 'heuristic';
}

const IMAGE_EXTENSION_PATTERN = /\.(png|jpe?g|webp|gif|bmp|avif|tiff?)(?:[?#]|$)/i;
const NON_IMAGE_PATH_PATTERN = /(^|[._-])(page|web|status|poll|callback|webhook|request|submit|queue|endpoint)[._-]?(url)?($|[._-])/i;
const IMAGE_PATH_PATTERN = /(^|[._-])(image|img|b64|base64|output|result|asset|file|media|download)[._-]?(url|data)?($|[._-])/i;

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeCandidateSource(
  value: unknown,
  path: string,
  trustStructuredPath = false,
): string | null {
  const source = nonEmptyString(value);
  if (!source || NON_IMAGE_PATH_PATTERN.test(path)) return null;
  if (source.startsWith('data:image/')) return source;
  if (/^https?:\/\//i.test(source)) {
    return trustStructuredPath || IMAGE_EXTENSION_PATTERN.test(source) || IMAGE_PATH_PATTERN.test(path)
      ? source
      : null;
  }
  const compact = source.replace(/\s+/g, '');
  if (
    compact.length > 300
    && /^[A-Za-z0-9+/_=-]+$/.test(compact)
    && (trustStructuredPath || IMAGE_PATH_PATTERN.test(path))
  ) {
    const standard = compact.replace(/-/g, '+').replace(/_/g, '/');
    const padding = standard.length % 4;
    return `data:image/png;base64,${padding ? `${standard}${'='.repeat(4 - padding)}` : standard}`;
  }
  return null;
}

function valueAtPath(payload: unknown, rawPath: string): unknown {
  const parts = rawPath.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let current = payload;
  for (const part of parts) {
    if (Array.isArray(current)) current = current[Number(part)];
    else if (current && typeof current === 'object') current = (current as Record<string, unknown>)[part];
    else return undefined;
  }
  return current;
}

function candidateAtPath(
  payload: unknown,
  path: string,
  confidence: ImageResultCandidate['confidence'],
): ImageResultCandidate | null {
  const source = normalizeCandidateSource(valueAtPath(payload, path), path, true);
  return source ? { source, path, confidence } : null;
}

function scanHeuristic(payload: unknown): ImageResultCandidate | null {
  const queue: Array<{ value: unknown; path: string; depth: number }> = [{ value: payload, path: '', depth: 0 }];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || current.depth > 8) continue;
    const source = normalizeCandidateSource(current.value, current.path);
    if (source) return { source, path: current.path, confidence: 'heuristic' };
    if (Array.isArray(current.value)) {
      current.value.forEach((value, index) => queue.push({
        value,
        path: `${current.path}[${index}]`,
        depth: current.depth + 1,
      }));
    } else if (current.value && typeof current.value === 'object') {
      Object.entries(current.value as Record<string, unknown>).forEach(([key, value]) => queue.push({
        value,
        path: current.path ? `${current.path}.${key}` : key,
        depth: current.depth + 1,
      }));
    }
  }
  return null;
}

export function parseCustomProviderModelId(modelId: string): ParsedCustomProviderModelId | null {
  if (!modelId.startsWith('custom:')) return null;
  const rest = modelId.slice('custom:'.length);
  const separator = rest.indexOf(':');
  if (separator <= 0) return null;
  const providerId = rest.slice(0, separator).trim();
  const upstreamModel = rest.slice(separator + 1).trim();
  return providerId && upstreamModel ? { providerId, upstreamModel } : null;
}

export function selectImageResultCandidate(
  payload: unknown,
  explicitPath?: string | null,
): ImageResultCandidate | null {
  const configuredPath = explicitPath?.trim();
  if (configuredPath) {
    const explicit = candidateAtPath(payload, configuredPath, 'explicit');
    if (explicit) return explicit;
  }

  const knownPaths = [
    'data[0].b64_json',
    'data[0].url',
    'output[0].result',
    'images[0].url',
    'images[0]',
    'result.image_url',
    'result.url',
  ];
  for (const path of knownPaths) {
    const candidate = candidateAtPath(payload, path, 'known-format');
    if (candidate) return candidate;
  }
  return scanHeuristic(payload);
}

export function redactSensitiveUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    const keys = Array.from(url.searchParams.keys());
    keys.forEach((key) => url.searchParams.set(key, '[redacted]'));
    url.hash = '';
    return url.toString();
  } catch {
    return rawUrl.replace(/([?&][^=&#]+)=([^&#]*)/g, '$1=[redacted]').replace(/#.*$/, '');
  }
}

export function shouldForwardProviderCredentials(providerBaseUrl: string, resultUrl: string): boolean {
  try {
    return new URL(providerBaseUrl).origin === new URL(resultUrl).origin;
  } catch {
    return false;
  }
}

export function resolveGenerationSubmissionRetryAttempts(method: 'GET' | 'POST'): number {
  return method === 'POST' ? 0 : 2;
}
