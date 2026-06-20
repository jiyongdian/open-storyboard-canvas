const COMMON_IMAGE_FILE_EXTENSION_PATTERN =
  /\.(?:png|jpe?g|webp|gif|bmp|avif|heic|heif|tiff?|svg)$/i;
const COMMON_VIDEO_FILE_EXTENSION_PATTERN =
  /\.(?:mp4|webm|mov|m4v|avi|mkv|mpe?g|3gp|3gpp)$/i;
const COMMON_AUDIO_FILE_EXTENSION_PATTERN =
  /\.(?:mp3|wav|m4a|aac|ogg|oga|flac|webm|opus|aiff?|caf)$/i;
const FILE_URL_TYPE_NAMES = new Set([
  'text/uri-list',
  'text/x-moz-url',
  'public.file-url',
  'public.url',
  'url',
]);

export type DroppedMaterialKind = 'image' | 'video' | 'audio';

export interface DroppedMaterialSource {
  source: string;
  kind: DroppedMaterialKind;
  fileName: string | null;
}

export function isImageFile(file: File | null | undefined): file is File {
  if (!file) {
    return false;
  }
  if (file.type.startsWith('image/')) {
    return true;
  }
  return COMMON_IMAGE_FILE_EXTENSION_PATTERN.test(file.name);
}

export function isVideoFile(file: File | null | undefined): file is File {
  if (!file) {
    return false;
  }
  if (file.type.startsWith('video/')) {
    return true;
  }
  return COMMON_VIDEO_FILE_EXTENSION_PATTERN.test(file.name);
}

export function isAudioFile(file: File | null | undefined): file is File {
  if (!file) {
    return false;
  }
  if (file.type.startsWith('audio/')) {
    return true;
  }
  return COMMON_AUDIO_FILE_EXTENSION_PATTERN.test(file.name);
}

export function isMaterialFile(file: File | null | undefined): file is File {
  return isImageFile(file) || isVideoFile(file) || isAudioFile(file);
}

export function inferMaterialFileKind(file: File | null | undefined): DroppedMaterialKind | null {
  if (isImageFile(file)) {
    return 'image';
  }
  if (isVideoFile(file)) {
    return 'video';
  }
  if (isAudioFile(file)) {
    return 'audio';
  }
  return null;
}

function normalizeDragType(type: string): string {
  return type.trim().toLowerCase();
}

function fileNameFromSource(source: string): string | null {
  const trimmed = source.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    const pathname = decodeURIComponent(parsed.pathname || '');
    const name = pathname.split(/[\\/]/).filter(Boolean).pop();
    return name || null;
  } catch {
    const name = trimmed.split(/[\\/]/).filter(Boolean).pop();
    return name || null;
  }
}

function inferMaterialKindFromSource(source: string): DroppedMaterialKind | null {
  const fileName = fileNameFromSource(source) ?? source;
  if (COMMON_IMAGE_FILE_EXTENSION_PATTERN.test(fileName)) {
    return 'image';
  }
  if (COMMON_VIDEO_FILE_EXTENSION_PATTERN.test(fileName)) {
    return 'video';
  }
  if (COMMON_AUDIO_FILE_EXTENSION_PATTERN.test(fileName)) {
    return 'audio';
  }
  return null;
}

export function dataTransferHasFile(dataTransfer: DataTransfer | null | undefined): boolean {
  if (!dataTransfer) {
    return false;
  }

  if (Array.from(dataTransfer.types || []).some(
    (type) => type.toLowerCase() === 'files'
  )) {
    return true;
  }

  if (Array.from(dataTransfer.items || []).some((item) => item.kind === 'file')) {
    return true;
  }

  return Array.from(dataTransfer.files || []).length > 0;
}

export function dataTransferHasExternalFilePayload(dataTransfer: DataTransfer | null | undefined): boolean {
  if (!dataTransfer) {
    return false;
  }
  if (dataTransferHasFile(dataTransfer)) {
    return true;
  }
  return Array.from(dataTransfer.types || []).some((type) => {
    const normalized = normalizeDragType(type);
    return FILE_URL_TYPE_NAMES.has(normalized) || normalized.includes('file');
  });
}

export function dataTransferHasImageFile(dataTransfer: DataTransfer | null | undefined): boolean {
  if (!dataTransfer) {
    return false;
  }

  if (Array.from(dataTransfer.items || []).some((item) => (
    item.kind === 'file'
    && (
      item.type.startsWith('image/')
      || item.type === ''
      || item.type === 'application/octet-stream'
      || COMMON_IMAGE_FILE_EXTENSION_PATTERN.test(item.getAsFile()?.name ?? '')
    )
  ))) {
    return true;
  }

  return Array.from(dataTransfer.files || []).some(isImageFile);
}

export function dataTransferHasVideoFile(dataTransfer: DataTransfer | null | undefined): boolean {
  if (!dataTransfer) {
    return false;
  }

  if (Array.from(dataTransfer.items || []).some((item) => (
    item.kind === 'file'
    && (
      item.type.startsWith('video/')
      || item.type === ''
      || item.type === 'application/octet-stream'
      || COMMON_VIDEO_FILE_EXTENSION_PATTERN.test(item.getAsFile()?.name ?? '')
    )
  ))) {
    return true;
  }

  return Array.from(dataTransfer.files || []).some(isVideoFile);
}

export function dataTransferHasAudioFile(dataTransfer: DataTransfer | null | undefined): boolean {
  if (!dataTransfer) {
    return false;
  }

  if (Array.from(dataTransfer.items || []).some((item) => (
    item.kind === 'file'
    && (
      item.type.startsWith('audio/')
      || item.type === ''
      || item.type === 'application/octet-stream'
      || COMMON_AUDIO_FILE_EXTENSION_PATTERN.test(item.getAsFile()?.name ?? '')
    )
  ))) {
    return true;
  }

  return Array.from(dataTransfer.files || []).some(isAudioFile);
}

export function dataTransferHasMaterialFile(dataTransfer: DataTransfer | null | undefined): boolean {
  return (
    dataTransferHasImageFile(dataTransfer)
    || dataTransferHasVideoFile(dataTransfer)
    || dataTransferHasAudioFile(dataTransfer)
  );
}

export function resolveDroppedImageFile(dataTransfer: DataTransfer | null | undefined): File | null {
  if (!dataTransfer) {
    return null;
  }

  for (const item of Array.from(dataTransfer.items || [])) {
    if (item.kind !== 'file') {
      continue;
    }
    const file = item.getAsFile();
    if (isImageFile(file)) {
      return file;
    }
  }

  return Array.from(dataTransfer.files || []).find(isImageFile) ?? null;
}

export function resolveDroppedVideoFile(dataTransfer: DataTransfer | null | undefined): File | null {
  if (!dataTransfer) {
    return null;
  }

  for (const item of Array.from(dataTransfer.items || [])) {
    if (item.kind !== 'file') {
      continue;
    }
    const file = item.getAsFile();
    if (isVideoFile(file)) {
      return file;
    }
  }

  return Array.from(dataTransfer.files || []).find(isVideoFile) ?? null;
}

export function resolveDroppedAudioFile(dataTransfer: DataTransfer | null | undefined): File | null {
  if (!dataTransfer) {
    return null;
  }

  for (const item of Array.from(dataTransfer.items || [])) {
    if (item.kind !== 'file') {
      continue;
    }
    const file = item.getAsFile();
    if (isAudioFile(file)) {
      return file;
    }
  }

  return Array.from(dataTransfer.files || []).find(isAudioFile) ?? null;
}

export function resolveDroppedMaterialFile(dataTransfer: DataTransfer | null | undefined): File | null {
  return (
    resolveDroppedImageFile(dataTransfer)
    || resolveDroppedVideoFile(dataTransfer)
    || resolveDroppedAudioFile(dataTransfer)
  );
}

export function resolveDroppedMaterialSource(dataTransfer: DataTransfer | null | undefined): DroppedMaterialSource | null {
  if (!dataTransfer) {
    return null;
  }

  const uriList = dataTransfer.getData('text/uri-list');
  const plainText = dataTransfer.getData('text/plain');
  const candidates = [uriList, plainText]
    .flatMap((value) => value.split(/\r?\n/))
    .map((value) => value.trim())
    .filter((value) => value && !value.startsWith('#'));

  for (const source of candidates) {
    if (!source.startsWith('file://') && !source.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(source)) {
      continue;
    }
    const kind = inferMaterialKindFromSource(source);
    if (!kind) {
      continue;
    }
    return {
      source,
      kind,
      fileName: fileNameFromSource(source),
    };
  }

  return null;
}
