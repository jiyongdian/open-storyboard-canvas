import { loadAudioSourceDataUrl } from '@/commands/image';
import { resolveImageDisplayUrl } from '@/features/canvas/application/imageData';
import type { AudioNodeData } from '@/features/canvas/domain/canvasNodes';

const AUDIO_METADATA_TIMEOUT_MS = 5000;

interface AudioFileMetadata {
  durationSeconds: number | null;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read audio file'));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      result ? resolve(result) : reject(new Error('Failed to read audio file'));
    };
    reader.readAsDataURL(file);
  });
}

function readAudioSourceMetadata(source: string): Promise<AudioFileMetadata> {
  return new Promise((resolve) => {
    const audio = document.createElement('audio');
    let isDone = false;
    const displaySource = resolveImageDisplayUrl(source);

    const cleanup = () => {
      audio.removeAttribute('src');
      audio.load();
    };

    const finish = (metadata: AudioFileMetadata) => {
      if (isDone) {
        return;
      }
      isDone = true;
      window.clearTimeout(timeoutId);
      cleanup();
      resolve(metadata);
    };

    const timeoutId = window.setTimeout(() => {
      finish({ durationSeconds: null });
    }, AUDIO_METADATA_TIMEOUT_MS);

    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      finish({
        durationSeconds: Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : null,
      });
    };
    audio.onerror = () => {
      finish({ durationSeconds: null });
    };
    audio.src = displaySource;
  });
}

function readAudioFileMetadata(file: File): Promise<AudioFileMetadata> {
  const objectUrl = URL.createObjectURL(file);
  return readAudioSourceMetadata(objectUrl).finally(() => {
    URL.revokeObjectURL(objectUrl);
  });
}

function fileNameFromSource(source: string): string | null {
  const trimmed = source.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    const pathname = decodeURIComponent(parsed.pathname || '');
    return pathname.split(/[\\/]/).filter(Boolean).pop() || null;
  } catch {
    return trimmed.split(/[\\/]/).filter(Boolean).pop() || null;
  }
}

function buildUploadedAudioNodeData(
  dataUrl: string,
  metadata: AudioFileMetadata,
  sourceFileName: string | null
): Partial<AudioNodeData> {
  return {
    audioUrl: dataUrl,
    localAudioUrl: dataUrl,
    sourceFileName,
    durationSeconds: metadata.durationSeconds,
    generatedFileName: null,
    generatedNamingMode: 'default',
    isGenerating: false,
    generationStartedAt: null,
    generationElapsedMs: null,
    generationError: null,
    generationErrorDetails: null,
    sourcePrompt: '',
    sourceTextLength: 0,
    sourceVoiceId: null,
    sourceModelId: null,
    sourceAudioMode: 'upload',
  };
}

export async function prepareAudioNodeDataFromFile(file: File): Promise<Partial<AudioNodeData>> {
  const metadataPromise = readAudioFileMetadata(file);
  const dataUrl = await readFileAsDataUrl(file);
  const metadata = await metadataPromise;

  return buildUploadedAudioNodeData(dataUrl, metadata, file.name);
}

export async function prepareAudioNodeDataFromSource(
  source: string,
  sourceFileName?: string | null
): Promise<Partial<AudioNodeData>> {
  const dataUrl = await loadAudioSourceDataUrl(source);
  const metadata = await readAudioSourceMetadata(dataUrl);
  return buildUploadedAudioNodeData(
    dataUrl,
    metadata,
    sourceFileName?.trim() || fileNameFromSource(source)
  );
}
