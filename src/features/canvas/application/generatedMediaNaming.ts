import type {
  ExportImageNodeData,
  VideoNodeData,
} from '@/features/canvas/domain/canvasNodes';

export const DEFAULT_GENERATED_IMAGE_DISPLAY_NAME = '生成图像';
export const DEFAULT_GENERATED_VIDEO_DISPLAY_NAME = '生成视频';

const LEGACY_IMAGE_DEFAULT_NAMES = new Set([
  DEFAULT_GENERATED_IMAGE_DISPLAY_NAME,
  '结果图片',
]);

const LEGACY_VIDEO_DEFAULT_NAMES = new Set([
  DEFAULT_GENERATED_VIDEO_DISPLAY_NAME,
  '结果视频',
]);

function sanitizeFileStem(raw: string | null | undefined, fallback: string): string {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (!trimmed) return fallback;

  const sanitized = trimmed
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\.+$/g, '')
    .trim();

  return sanitized || fallback;
}

export function extractFileNameFromPath(value: string | null | undefined): string | null {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const normalized = trimmed.toLowerCase().startsWith('file://')
      ? decodeURIComponent(trimmed.replace(/^file:\/\//i, ''))
      : trimmed;
    const parts = normalized.split(/[\\/]/);
    const fileName = parts[parts.length - 1]?.trim();
    return fileName || null;
  } catch {
    const parts = trimmed.split(/[\\/]/);
    const fileName = parts[parts.length - 1]?.trim();
    return fileName || null;
  }
}

function extractFileExtension(fileName: string | null | undefined, fallback: string): string {
  const value = fileName ?? '';
  const lastDot = value.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === value.length - 1) return fallback;
  return value.slice(lastDot + 1);
}

export function stripFileExtension(fileName: string): string {
  const trimmed = fileName.trim();
  const lastDot = trimmed.lastIndexOf('.');
  if (lastDot <= 0) return trimmed;
  return trimmed.slice(0, lastDot);
}

export function resolveCustomGeneratedImageName(displayName: string | null | undefined): string | null {
  const trimmed = typeof displayName === 'string' ? displayName.trim() : '';
  if (!trimmed || LEGACY_IMAGE_DEFAULT_NAMES.has(trimmed)) return null;
  return trimmed;
}

export function resolveCustomGeneratedVideoName(displayName: string | null | undefined): string | null {
  const trimmed = typeof displayName === 'string' ? displayName.trim() : '';
  if (!trimmed || LEGACY_VIDEO_DEFAULT_NAMES.has(trimmed)) return null;
  return trimmed;
}

export function resolveGeneratedImageSaveFileName(
  data: Partial<ExportImageNodeData>,
  fallbackExtension = 'png'
): string {
  const generatedFileName = data.generatedFileName?.trim() || null;
  const customName = resolveCustomGeneratedImageName(data.displayName);
  const sourceFileName = extractFileNameFromPath(data.imageUrl);
  const extension = extractFileExtension(generatedFileName ?? sourceFileName, fallbackExtension);
  if (customName) {
    return `${sanitizeFileStem(customName, DEFAULT_GENERATED_IMAGE_DISPLAY_NAME)}.${extension}`;
  }
  if (generatedFileName) return generatedFileName;
  return `${DEFAULT_GENERATED_IMAGE_DISPLAY_NAME}.${extension}`;
}

export function resolveGeneratedVideoSaveFileName(
  data: Partial<VideoNodeData>,
  fallbackExtension = 'mp4'
): string {
  const generatedFileName = data.generatedFileName?.trim() || null;
  const customName = resolveCustomGeneratedVideoName(data.displayName);
  const sourceFileName = extractFileNameFromPath(data.localVideoUrl || data.videoUrl);
  const extension = extractFileExtension(generatedFileName ?? sourceFileName, fallbackExtension);
  if (customName) {
    return `${sanitizeFileStem(customName, DEFAULT_GENERATED_VIDEO_DISPLAY_NAME)}.${extension}`;
  }
  if (generatedFileName) return generatedFileName;
  return `${DEFAULT_GENERATED_VIDEO_DISPLAY_NAME}.${extension}`;
}

export function resolveSuggestedImageStem(data: Partial<ExportImageNodeData>): string {
  return stripFileExtension(resolveGeneratedImageSaveFileName(data));
}

export function resolveSuggestedVideoStem(data: Partial<VideoNodeData>): string {
  return stripFileExtension(resolveGeneratedVideoSaveFileName(data));
}
