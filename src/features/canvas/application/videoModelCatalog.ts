import { useMemo } from 'react';

import {
  AGNES_PROVIDER_DEFAULTS,
  isVideoCustomProvider,
  useCustomProvidersStore,
  type CustomProviderConfig,
} from '@/stores/customProvidersStore';
import { hasCustomProviderCredential } from '@/features/canvas/application/providerAvailability';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  defaultVideoInputSchemaForProviderKind,
  normalizeVideoInputSchema,
  resolveVideoInputSchemaFromExtraParams,
  type VideoInputSchema,
} from './videoInputSchema';

export interface VideoCatalogEntry {
  id: string;
  providerId: string;
  providerLabel: string;
  modelId: string;
  modelLabel: string;
  defaultExtraParams?: Record<string, unknown>;
  supportedDurations: string[];
  supportedResolutions: string[];
  supportedAspectRatios: string[];
  inputSchema: VideoInputSchema;
  usable: boolean;
  notReadyReason?: string;
}

export interface VideoModelConfigValue {
  entryId: string;
  duration: string;
  resolution: string;
  aspectRatio?: string;
  extraParams?: Record<string, unknown>;
}

const DEFAULT_DURATIONS = ['4', '8', '12'];
const AGNES_DURATIONS = Array.from({ length: 18 }, (_, index) => String(index + 1));
const DEFAULT_RESOLUTIONS = ['1280x720', '720x1280', '1024x1024'];
const DEFAULT_ASPECT_RATIOS = ['16:9', '9:16', '1:1'];
const AGNES_VIDEO_RESOLUTIONS = [...AGNES_PROVIDER_DEFAULTS.videoResolutions];
const AGNES_DEFAULT_DURATION = '5';
const DREAMINA_SEEDANCE_MODELS = ['seedance2.0', 'seedance2.0fast', 'seedance2.0_vip', 'seedance2.0fast_vip', 'seedance2.0mini'];
const DREAMINA_IMAGE_VIDEO_MODELS = ['3.0', '3.0fast', '3.0pro', '3.0_fast', '3.0_pro', '3.5pro', '3.5_pro', ...DREAMINA_SEEDANCE_MODELS];
const DREAMINA_FRAMES_MODELS = ['3.0', '3.5pro', ...DREAMINA_SEEDANCE_MODELS];
const DREAMINA_VIDEO_RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'];
const DREAMINA_SEEDANCE_DURATIONS = Array.from({ length: 12 }, (_, index) => String(index + 4));
const DREAMINA_3_DURATIONS = Array.from({ length: 8 }, (_, index) => String(index + 3));
const DREAMINA_35_DURATIONS = Array.from({ length: 9 }, (_, index) => String(index + 4));

interface DreaminaProviderStatus {
  loggedIn: boolean;
}

function uniqueStrings(values: unknown, fallback: string[]): string[] {
  if (!Array.isArray(values)) {
    return fallback;
  }
  const seen = new Set<string>();
  const normalized: string[] = [];
  values.forEach((value) => {
    const text = String(value ?? '').trim();
    if (!text || seen.has(text)) return;
    seen.add(text);
    normalized.push(text);
  });
  return normalized.length > 0 ? normalized : fallback;
}

function resolveModelDescription(
  provider: CustomProviderConfig,
  modelId: string
): string | undefined {
  const descriptions = provider.extraParams?.modelDescriptions;
  if (!descriptions || typeof descriptions !== 'object' || Array.isArray(descriptions)) {
    return undefined;
  }
  const value = (descriptions as Record<string, unknown>)[modelId];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function buildVideoModelCatalog(
  customProviders: readonly CustomProviderConfig[],
  agnesApiKey = '',
  dreaminaStatus?: DreaminaProviderStatus | null
): VideoCatalogEntry[] {
  const entries: VideoCatalogEntry[] = [];
  for (const provider of customProviders) {
    if (!isVideoCustomProvider(provider)) {
      continue;
    }

    const models = provider.models.length > 0 ? provider.models : ['sora-2'];
    const supportedDurations = uniqueStrings(
      provider.extraParams?.supportedDurations,
      DEFAULT_DURATIONS
    );
    const supportedResolutions = uniqueStrings(
      provider.supportedResolutions ?? provider.extraParams?.supportedResolutions,
      DEFAULT_RESOLUTIONS
    );
    const supportedAspectRatios = uniqueStrings(
      provider.extraParams?.supportedRatios,
      DEFAULT_ASPECT_RATIOS
    );
    const hasBaseUrl = Boolean(provider.baseUrl?.trim());
    const hasCredential = hasCustomProviderCredential(provider);
    const usable = hasBaseUrl && hasCredential;

    for (const modelId of models) {
      entries.push({
        id: `custom:${provider.id}:${modelId}`,
        providerId: provider.id,
        providerLabel: provider.label,
        modelId,
        modelLabel: resolveModelDescription(provider, modelId) ?? modelId,
        supportedDurations,
        supportedResolutions,
        supportedAspectRatios,
        inputSchema: resolveVideoInputSchemaFromExtraParams(provider.extraParams, modelId),
        usable,
        notReadyReason: usable
          ? undefined
          : (hasBaseUrl ? '请在「我的配置」里填入 API Key' : '请在「我的配置」里填入 API 根地址'),
      });
    }
  }
  if (agnesApiKey.trim()) {
    for (const [modelId, modelLabel] of [
      [AGNES_PROVIDER_DEFAULTS.models.video20, 'Agnes Video v2.0'],
    ] as const) {
      entries.push({
        id: `agnes:video:${modelId}`,
        providerId: 'agnes',
        providerLabel: 'Agnes',
        modelId,
        modelLabel,
        supportedDurations: AGNES_DURATIONS,
        supportedResolutions: AGNES_VIDEO_RESOLUTIONS,
        supportedAspectRatios: DEFAULT_ASPECT_RATIOS,
        inputSchema: defaultVideoInputSchemaForProviderKind('agnes-video'),
        usable: true,
      });
    }
  }
  if (dreaminaStatus?.loggedIn) {
    const dreaminaProvider = '即梦 CLI';
    const videoResolutionFor = (modelVersion: string) =>
      modelVersion === 'seedance2.0_vip' ? ['720p', '1080p'] : ['720p'];
    const durationFor = (modelVersion: string) => {
      if (modelVersion.startsWith('3.0')) return DREAMINA_3_DURATIONS;
      if (modelVersion === '3.5pro' || modelVersion === '3.5_pro') return DREAMINA_35_DURATIONS;
      return DREAMINA_SEEDANCE_DURATIONS;
    };
    const textOnlySchema = normalizeVideoInputSchema({
      images: { enabled: false, min: 0, max: 0, roles: ['reference'], requireImageHost: false },
      video: { enabled: false, min: 0, max: 0, field: '' },
      audio: { enabled: false, min: 0, max: 0, field: '' },
    });
    const oneImageSchema = normalizeVideoInputSchema({
      images: { enabled: true, min: 1, max: 1, roles: ['firstFrame'], requireImageHost: false },
      video: { enabled: false, min: 0, max: 0, field: '' },
      audio: { enabled: false, min: 0, max: 0, field: '' },
    });
    const twoImageSchema = normalizeVideoInputSchema({
      images: { enabled: true, min: 2, max: 2, roles: ['firstFrame', 'lastFrame'], requireImageHost: false },
      video: { enabled: false, min: 0, max: 0, field: '' },
      audio: { enabled: false, min: 0, max: 0, field: '' },
    });
    const multiImageSchema = normalizeVideoInputSchema({
      images: { enabled: true, min: 2, max: 20, roles: ['keyframe'], requireImageHost: false },
      video: { enabled: false, min: 0, max: 0, field: '' },
      audio: { enabled: false, min: 0, max: 0, field: '' },
    });
    const allReferenceSchema = normalizeVideoInputSchema({
      images: { enabled: true, min: 0, max: 9, roles: ['reference', 'firstFrame', 'lastFrame', 'keyframe'], requireImageHost: false },
      video: { enabled: true, min: 0, max: 3, field: 'video' },
      audio: { enabled: true, min: 0, max: 3, field: 'audio' },
    });

    for (const modelVersion of DREAMINA_SEEDANCE_MODELS) {
      entries.push({
        id: `dreamina:all-reference-video:${modelVersion}`,
        providerId: 'dreamina',
        providerLabel: dreaminaProvider,
        modelId: modelVersion,
        modelLabel: `全能参考成片 · ${modelVersion}`,
        defaultExtraParams: { modelVersion },
        supportedDurations: DREAMINA_SEEDANCE_DURATIONS,
        supportedResolutions: videoResolutionFor(modelVersion),
        supportedAspectRatios: DREAMINA_VIDEO_RATIOS,
        inputSchema: allReferenceSchema,
        usable: true,
      });
    }
    for (const modelVersion of DREAMINA_SEEDANCE_MODELS) {
      entries.push({
        id: `dreamina:text-video:${modelVersion}`,
        providerId: 'dreamina',
        providerLabel: dreaminaProvider,
        modelId: modelVersion,
        modelLabel: `文生视频 · ${modelVersion}`,
        defaultExtraParams: { modelVersion },
        supportedDurations: DREAMINA_SEEDANCE_DURATIONS,
        supportedResolutions: videoResolutionFor(modelVersion),
        supportedAspectRatios: DREAMINA_VIDEO_RATIOS,
        inputSchema: textOnlySchema,
        usable: true,
      });
    }
    for (const modelVersion of DREAMINA_IMAGE_VIDEO_MODELS) {
      entries.push({
        id: `dreamina:image-video:${modelVersion}`,
        providerId: 'dreamina',
        providerLabel: dreaminaProvider,
        modelId: modelVersion,
        modelLabel: `图生视频 · ${modelVersion}`,
        defaultExtraParams: { modelVersion },
        supportedDurations: durationFor(modelVersion),
        supportedResolutions: videoResolutionFor(modelVersion),
        supportedAspectRatios: ['auto'],
        inputSchema: oneImageSchema,
        usable: true,
      });
    }
    for (const modelVersion of DREAMINA_FRAMES_MODELS) {
      entries.push({
        id: `dreamina:frames-video:${modelVersion}`,
        providerId: 'dreamina',
        providerLabel: dreaminaProvider,
        modelId: modelVersion,
        modelLabel: `首尾帧成片 · ${modelVersion}`,
        defaultExtraParams: { modelVersion },
        supportedDurations: durationFor(modelVersion),
        supportedResolutions: videoResolutionFor(modelVersion),
        supportedAspectRatios: ['auto'],
        inputSchema: twoImageSchema,
        usable: true,
      });
    }
    entries.push({
      id: 'dreamina:multi-frame-video',
      providerId: 'dreamina',
      providerLabel: dreaminaProvider,
      modelId: 'multi-frame-video',
      modelLabel: '多帧成片 · 智能多图',
      supportedDurations: ['3', '5', '8', '12', '15'],
      supportedResolutions: ['智能'],
      supportedAspectRatios: ['auto'],
      inputSchema: multiImageSchema,
      usable: true,
    });
  }
  return entries;
}

export function useVideoModelCatalog(): VideoCatalogEntry[] {
  const customProviders = useCustomProvidersStore((state) => state.providers);
  const agnesApiKey = useSettingsStore((state) => state.agnesApiKey);
  const dreaminaStatus = useSettingsStore((state) => state.dreaminaStatus);
  return useMemo(
    () => buildVideoModelCatalog(customProviders, agnesApiKey, dreaminaStatus),
    [agnesApiKey, customProviders, dreaminaStatus]
  );
}

export function resolveVideoModelConfig(
  catalog: readonly VideoCatalogEntry[],
  current?: VideoModelConfigValue | null
): VideoModelConfigValue | undefined {
  const currentEntry = current
    ? catalog.find((entry) => entry.id === current.entryId && entry.usable)
    : undefined;
  const entry = currentEntry ?? catalog.find((candidate) => candidate.usable);
  if (!entry) {
    return undefined;
  }
  const defaultDuration = entry.providerId === 'agnes' && entry.supportedDurations.includes(AGNES_DEFAULT_DURATION)
    ? AGNES_DEFAULT_DURATION
    : entry.supportedDurations[0] ?? DEFAULT_DURATIONS[0];
  const duration = current?.duration && entry.supportedDurations.includes(current.duration)
    ? current.duration
    : defaultDuration;
  const resolution = current?.resolution && entry.supportedResolutions.includes(current.resolution)
    ? current.resolution
    : entry.supportedResolutions[0] ?? DEFAULT_RESOLUTIONS[0];
  const aspectRatio = current?.aspectRatio && entry.supportedAspectRatios.includes(current.aspectRatio)
    ? current.aspectRatio
    : entry.supportedAspectRatios[0] ?? DEFAULT_ASPECT_RATIOS[0];
  return {
    entryId: entry.id,
    duration,
    resolution,
    aspectRatio,
    extraParams: {
      ...(entry.defaultExtraParams ?? {}),
      ...(current?.extraParams ?? {}),
    },
  };
}
