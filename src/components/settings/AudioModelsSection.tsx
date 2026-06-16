import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Cloud, Music2, RefreshCw, Save } from 'lucide-react';

import {
  DEFAULT_AUDIO_GENERATION_SETTINGS,
  normalizeAudioGenerationSettings,
  useSettingsStore,
  type AudioGenerationSettings,
  type AudioModelConfig,
  type AudioOutputMode,
  type AudioProviderKind,
} from '@/stores/settingsStore';
import { defaultAudioInputSchemaForProviderKind } from '@/features/canvas/application/audioInputSchema';
import { fetchLocalAudioHealth, fetchLocalAudioVoices } from '@/features/canvas/infrastructure/localAudioGateway';
import { UiButton, UiCheckbox, UiInput, UiSelect, UiTextArea } from '@/components/ui';

type AudioSettingsPatch =
  Partial<Omit<AudioGenerationSettings, 'models'>>
  & { models?: AudioModelConfig[] };

const AUDIO_PROVIDER_ORDER: AudioProviderKind[] = ['local-doubao-tts', 'gradio-voxcpm'];

const PROVIDER_LABELS: Record<AudioProviderKind, { title: string; description: string }> = {
  'local-doubao-tts': {
    title: '豆包 TTS',
    description: '本地音频 API 与音色同步',
  },
  'gradio-voxcpm': {
    title: 'VoxCPM 在线 TTS',
    description: 'Gradio 在线生成与参考音频',
  },
};

function createAudioModelDraft(providerKind: AudioProviderKind, baseUrl: string): AudioModelConfig {
  if (providerKind === 'gradio-voxcpm') {
    return {
      id: 'voxcpm-online',
      name: 'VoxCPM 在线 TTS',
      providerKind: 'gradio-voxcpm',
      apiBaseUrl: 'https://voxcpm.modelbest.cn',
      endpointPath: '/gradio_api/call/generate',
      outputMode: 'server',
      defaultVoiceId: '',
      timeoutMs: 180000,
      enabled: true,
      extraParams: {
        audioInputSchema: defaultAudioInputSchemaForProviderKind('gradio-voxcpm'),
        controlInstruction: '自然、清晰、有表现力',
        usePromptText: false,
        promptTextValue: '',
        cfgValue: 2,
        doNormalize: false,
        denoise: false,
        ditSteps: 10,
        userId: 'fp-2fejme4mpcko',
      },
    };
  }

  return {
    id: 'local-doubao-tts',
    name: '本地豆包 TTS',
    providerKind: 'local-doubao-tts',
    apiBaseUrl: baseUrl || DEFAULT_AUDIO_GENERATION_SETTINGS.apiBaseUrl,
    endpointPath: '/tts',
    outputMode: 'server',
    defaultVoiceId: '',
    timeoutMs: 180000,
    enabled: true,
    extraParams: {},
  };
}

function normalizeProviderModels(settings: AudioGenerationSettings): AudioGenerationSettings {
  const models = AUDIO_PROVIDER_ORDER.map((providerKind) => {
    const fallback = createAudioModelDraft(providerKind, settings.apiBaseUrl);
    const existing = settings.models.find((model) => model.providerKind === providerKind);
    if (!existing) {
      return fallback;
    }
    return {
      ...fallback,
      ...existing,
      id: fallback.id,
      providerKind,
      defaultVoiceId: providerKind === 'local-doubao-tts' ? existing.defaultVoiceId : '',
      extraParams: {
        ...(fallback.extraParams ?? {}),
        ...(existing.extraParams ?? {}),
      },
    };
  });

  return {
    ...settings,
    models,
  };
}

function cloneSettings(settings: AudioGenerationSettings): AudioGenerationSettings {
  const normalized = normalizeProviderModels(settings);
  return {
    ...normalized,
    voices: normalized.voices.map((voice) => ({ ...voice })),
    categories: normalized.categories.map((category) => ({ ...category })),
    models: normalized.models.map((model) => ({
      ...model,
      extraParams: { ...(model.extraParams ?? {}) },
    })),
  };
}

function formatSyncTime(value: number | null | undefined): string {
  if (!value) {
    return '尚未同步';
  }
  try {
    return new Date(value).toLocaleString();
  } catch {
    return '尚未同步';
  }
}

export function AudioModelsSection() {
  const audioGenerationSettings = useSettingsStore((state) => state.audioGenerationSettings);
  const setAudioGenerationSettings = useSettingsStore((state) => state.setAudioGenerationSettings);
  const [draft, setDraft] = useState<AudioGenerationSettings>(() => cloneSettings(audioGenerationSettings));
  const [selectedProvider, setSelectedProvider] = useState<AudioProviderKind>('local-doubao-tts');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    setDraft(cloneSettings(audioGenerationSettings));
  }, [audioGenerationSettings]);

  const selectedModel = useMemo(
    () => draft.models.find((model) => model.providerKind === selectedProvider)
      ?? createAudioModelDraft(selectedProvider, draft.apiBaseUrl),
    [draft.apiBaseUrl, draft.models, selectedProvider]
  );

  const localModel = useMemo(
    () => draft.models.find((model) => model.providerKind === 'local-doubao-tts')
      ?? createAudioModelDraft('local-doubao-tts', draft.apiBaseUrl),
    [draft.apiBaseUrl, draft.models]
  );

  const updateDraft = (patch: AudioSettingsPatch) => {
    setDraft((previous) => normalizeProviderModels({
      ...previous,
      ...patch,
    }));
    setError('');
    setStatus('');
  };

  const updateProviderModel = (providerKind: AudioProviderKind, patch: Partial<AudioModelConfig>) => {
    setDraft((previous) => normalizeProviderModels({
      ...previous,
      models: previous.models.map((model) => (
        model.providerKind === providerKind
          ? {
            ...model,
            ...patch,
            providerKind,
            defaultVoiceId: providerKind === 'local-doubao-tts'
              ? patch.defaultVoiceId ?? model.defaultVoiceId
              : '',
            extraParams: patch.extraParams
              ? { ...(patch.extraParams ?? {}) }
              : model.extraParams,
          }
          : model
      )),
    }));
    setError('');
    setStatus('');
  };

  const updateProviderExtraParams = (providerKind: AudioProviderKind, patch: Record<string, unknown>) => {
    setDraft((previous) => normalizeProviderModels({
      ...previous,
      models: previous.models.map((model) => (
        model.providerKind === providerKind
          ? {
            ...model,
            extraParams: {
              ...(model.extraParams ?? {}),
              ...patch,
            },
          }
          : model
      )),
    }));
    setError('');
    setStatus('');
  };

  const checkHealth = async () => {
    setIsChecking(true);
    setError('');
    setStatus('');
    try {
      await fetchLocalAudioHealth(localModel.apiBaseUrl || draft.apiBaseUrl);
      setStatus('豆包本地音频 API 连接正常。');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '豆包本地音频 API 检测失败。');
    } finally {
      setIsChecking(false);
    }
  };

  const syncVoices = async () => {
    setIsSyncing(true);
    setError('');
    setStatus('');
    try {
      const catalog = await fetchLocalAudioVoices(localModel.apiBaseUrl || draft.apiBaseUrl, { refresh: true });
      const categories = catalog.categories.length > 0 ? catalog.categories : draft.categories;
      const selectedVoiceId = catalog.selectedVoiceId || draft.selectedVoiceId || catalog.voices[0]?.id || '';
      const nextSettings = normalizeProviderModels(normalizeAudioGenerationSettings({
        ...draft,
        apiBaseUrl: localModel.apiBaseUrl || draft.apiBaseUrl,
        voices: catalog.voices,
        categories,
        selectedVoiceId,
        lastSyncedAt: Date.now(),
        models: draft.models.map((model) => (
          model.providerKind === 'local-doubao-tts'
            ? {
              ...model,
              defaultVoiceId: model.defaultVoiceId || selectedVoiceId,
            }
            : {
              ...model,
              defaultVoiceId: '',
            }
        )),
      }));
      setDraft(nextSettings);
      setStatus(`已同步 ${catalog.voices.length} 个豆包音色。`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '豆包音色同步失败。');
    } finally {
      setIsSyncing(false);
    }
  };

  const save = () => {
    const normalized = normalizeProviderModels(normalizeAudioGenerationSettings(draft));
    setAudioGenerationSettings(normalized);
    setDraft(cloneSettings(normalized));
    setError('');
    setSaved(true);
    setStatus('音频模型配置已保存。');
    window.setTimeout(() => setSaved(false), 1400);
  };

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex w-[280px] shrink-0 flex-col border-r border-border-dark bg-bg-dark">
        <div className="border-b border-border-dark px-4 py-4">
          <div className="text-sm font-semibold text-text-dark">音频模型配置</div>
          <div className="mt-1 text-xs leading-5 text-text-muted">豆包和 VoxCPM 是同一项音频模型配置下的供应商选项</div>
        </div>

        <div className="flex flex-col gap-2 p-3">
          {AUDIO_PROVIDER_ORDER.map((providerKind) => {
            const model = draft.models.find((item) => item.providerKind === providerKind)
              ?? createAudioModelDraft(providerKind, draft.apiBaseUrl);
            const active = selectedProvider === providerKind;
            const meta = PROVIDER_LABELS[providerKind];
            const Icon = providerKind === 'local-doubao-tts' ? Music2 : Cloud;
            return (
              <button
                key={providerKind}
                type="button"
                className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${
                  active
                    ? 'border-accent/60 bg-accent/10'
                    : 'border-border-dark bg-surface-dark hover:border-[rgba(255,255,255,0.2)]'
                }`}
                onClick={() => {
                  setSelectedProvider(providerKind);
                  setError('');
                  setStatus('');
                }}
              >
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 shrink-0 text-accent" />
                  <div className="min-w-0 flex-1 truncate text-sm font-medium text-text-dark">
                    {meta.title}
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${
                    model.enabled
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'bg-white/8 text-text-muted'
                  }`}>
                    {model.enabled ? '启用' : '停用'}
                  </span>
                </div>
                <div className="mt-1 truncate text-[11px] text-text-muted">{meta.description}</div>
                <div className="mt-1 truncate text-[11px] text-text-muted">
                  {model.apiBaseUrl}{model.endpointPath}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-border-dark px-6 py-5">
          <h2 className="text-lg font-semibold text-text-dark">{PROVIDER_LABELS[selectedProvider].title}</h2>
          <p className="mt-1 text-sm text-text-muted">
            {selectedProvider === 'local-doubao-tts'
              ? '配置豆包本地音频 API、同步音色，并作为 AI 音频节点的豆包生成选项。'
              : '配置 VoxCPM Gradio API、声音控制参数和参考音频生成方式。'}
          </p>
        </div>

        <div className="ui-scrollbar flex-1 overflow-y-auto p-6">
          <div className="flex flex-col gap-5">
            <div className="rounded-lg border border-border-dark bg-bg-dark p-4">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-medium text-text-dark">基础配置</h3>
                  <p className="mt-1 text-xs text-text-muted">
                    {selectedProvider === 'local-doubao-tts'
                      ? '豆包本地 API 会使用 /health、/voices 和 /tts。'
                      : 'VoxCPM 会使用 /gradio_api/call/generate 和 /gradio_api/upload。'}
                  </p>
                </div>
                <label className="flex shrink-0 items-center gap-2 rounded-lg border border-border-dark bg-surface-dark px-3 py-2 text-xs text-text-muted">
                  <UiCheckbox
                    checked={selectedModel.enabled}
                    onCheckedChange={(checked) => updateProviderModel(selectedProvider, { enabled: checked })}
                  />
                  启用
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-medium text-text-muted">
                  配置名称
                  <UiInput
                    value={selectedModel.name}
                    onChange={(event) => updateProviderModel(selectedProvider, { name: event.target.value })}
                    className="mt-2 h-9"
                  />
                </label>

                <label className="text-xs font-medium text-text-muted">
                  超时（ms）
                  <UiInput
                    type="number"
                    min={5000}
                    max={600000}
                    step={1000}
                    value={selectedModel.timeoutMs}
                    onChange={(event) => updateProviderModel(selectedProvider, { timeoutMs: Number(event.target.value) })}
                    className="mt-2 h-9"
                  />
                </label>

                <label className="text-xs font-medium text-text-muted">
                  API 根地址
                  <UiInput
                    value={selectedModel.apiBaseUrl}
                    onChange={(event) => {
                      const apiBaseUrl = event.target.value;
                      updateProviderModel(selectedProvider, { apiBaseUrl });
                      if (selectedProvider === 'local-doubao-tts') {
                        updateDraft({ apiBaseUrl });
                      }
                    }}
                    className="mt-2 h-9"
                  />
                </label>

                <label className="text-xs font-medium text-text-muted">
                  接口路径
                  <UiInput
                    value={selectedModel.endpointPath}
                    onChange={(event) => updateProviderModel(selectedProvider, { endpointPath: event.target.value })}
                    className="mt-2 h-9"
                  />
                </label>

                {selectedProvider === 'local-doubao-tts' ? (
                  <>
                    <label className="text-xs font-medium text-text-muted">
                      输出模式
                      <UiSelect
                        value={selectedModel.outputMode}
                        onChange={(event) => {
                          const outputMode = event.target.value as AudioOutputMode;
                          updateProviderModel('local-doubao-tts', { outputMode });
                          updateDraft({ defaultOutputMode: outputMode });
                        }}
                        className="mt-2"
                        aria-label="豆包输出模式"
                      >
                        <option value="server">server 单文件</option>
                        <option value="segmented">segmented 分段</option>
                      </UiSelect>
                    </label>

                    <label className="text-xs font-medium text-text-muted">
                      默认音色
                      <UiSelect
                        value={selectedModel.defaultVoiceId}
                        onChange={(event) => {
                          const defaultVoiceId = event.target.value;
                          updateProviderModel('local-doubao-tts', { defaultVoiceId });
                          updateDraft({ selectedVoiceId: defaultVoiceId });
                        }}
                        className="mt-2"
                        aria-label="豆包默认音色"
                      >
                        <option value="">自动 / 不指定</option>
                        {draft.voices.map((voice) => (
                          <option key={voice.id} value={voice.id}>
                            {voice.name}{voice.category ? ` · ${voice.category}` : ''}
                          </option>
                        ))}
                      </UiSelect>
                    </label>
                  </>
                ) : null}
              </div>
            </div>

            {selectedProvider === 'local-doubao-tts' ? (
              <div className="rounded-lg border border-border-dark bg-bg-dark p-4">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-medium text-text-dark">豆包音色同步</h3>
                    <p className="mt-1 text-xs text-text-muted">
                      只同步豆包本地 API 的音色，不会写入 VoxCPM 配置。
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <UiButton type="button" size="sm" onClick={() => void checkHealth()} disabled={isChecking}>
                      {isChecking ? <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
                      检测
                    </UiButton>
                    <UiButton type="button" size="sm" variant="primary" onClick={() => void syncVoices()} disabled={isSyncing}>
                      <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                      同步音色
                    </UiButton>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
                  <span>已保存音色 {draft.voices.length} 个</span>
                  <span>分类 {draft.categories.length} 个</span>
                  <span>上次同步：{formatSyncTime(draft.lastSyncedAt)}</span>
                </div>

                {draft.voices.length > 0 ? (
                  <div className="ui-scrollbar mt-4 grid max-h-[220px] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                    {draft.voices.slice(0, 160).map((voice) => (
                      <div key={voice.id} className="rounded-md border border-border-dark bg-surface-dark px-3 py-2">
                        <div className="truncate text-xs font-medium text-text-dark">{voice.name}</div>
                        <div className="mt-0.5 truncate text-[11px] text-text-muted">{voice.category || voice.locale || voice.id}</div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-lg border border-border-dark bg-bg-dark p-4">
                <div className="mb-4">
                  <h3 className="text-sm font-medium text-text-dark">VoxCPM 参数</h3>
                  <p className="mt-1 text-xs text-text-muted">
                    VoxCPM 不使用豆包音色；可通过控制说明或连接音频卡片做参考。
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-medium text-text-muted sm:col-span-2">
                    控制说明（Voice Design）
                    <UiTextArea
                      value={String(selectedModel.extraParams?.controlInstruction ?? '')}
                      onChange={(event) => updateProviderExtraParams('gradio-voxcpm', {
                        controlInstruction: event.target.value,
                      })}
                      className="mt-2 min-h-[84px]"
                      placeholder="例如：年轻女声，自然、清晰、有表现力"
                    />
                  </label>

                  <label className="text-xs font-medium text-text-muted">
                    CFG（1-3）
                    <UiInput
                      type="number"
                      min={1}
                      max={3}
                      step={0.1}
                      value={Number(selectedModel.extraParams?.cfgValue ?? 2)}
                      onChange={(event) => updateProviderExtraParams('gradio-voxcpm', {
                        cfgValue: Number(event.target.value),
                      })}
                      className="mt-2 h-9"
                    />
                  </label>

                  <label className="text-xs font-medium text-text-muted">
                    推理步数（1-50）
                    <UiInput
                      type="number"
                      min={1}
                      max={50}
                      step={1}
                      value={Number(selectedModel.extraParams?.ditSteps ?? 10)}
                      onChange={(event) => updateProviderExtraParams('gradio-voxcpm', {
                        ditSteps: Number(event.target.value),
                      })}
                      className="mt-2 h-9"
                    />
                  </label>

                  <label className="text-xs font-medium text-text-muted">
                    User ID
                    <UiInput
                      value={String(selectedModel.extraParams?.userId ?? 'fp-2fejme4mpcko')}
                      onChange={(event) => updateProviderExtraParams('gradio-voxcpm', {
                        userId: event.target.value,
                      })}
                      className="mt-2 h-9"
                    />
                  </label>

                  <div className="flex flex-col gap-2 rounded-lg border border-border-dark bg-surface-dark px-3 py-2 text-xs text-text-muted">
                    <label className="flex items-center gap-2">
                      <UiCheckbox
                        checked={selectedModel.extraParams?.doNormalize === true}
                        onCheckedChange={(checked) => updateProviderExtraParams('gradio-voxcpm', {
                          doNormalize: checked,
                        })}
                      />
                      文本规范化
                    </label>
                    <label className="flex items-center gap-2">
                      <UiCheckbox
                        checked={selectedModel.extraParams?.denoise === true}
                        onCheckedChange={(checked) => updateProviderExtraParams('gradio-voxcpm', {
                          denoise: checked,
                        })}
                      />
                      参考音频降噪
                    </label>
                    <label className="flex items-center gap-2">
                      <UiCheckbox
                        checked={selectedModel.extraParams?.usePromptText === true}
                        onCheckedChange={(checked) => updateProviderExtraParams('gradio-voxcpm', {
                          usePromptText: checked,
                        })}
                      />
                      使用参考音频文本
                    </label>
                  </div>

                  {selectedModel.extraParams?.usePromptText === true ? (
                    <label className="text-xs font-medium text-text-muted sm:col-span-2">
                      参考音频文本
                      <UiTextArea
                        value={String(selectedModel.extraParams?.promptTextValue ?? '')}
                        onChange={(event) => updateProviderExtraParams('gradio-voxcpm', {
                          promptTextValue: event.target.value,
                        })}
                        className="mt-2 min-h-[74px]"
                        placeholder="如果使用 Ultimate Cloning，在这里填写参考音频对应文本"
                      />
                    </label>
                  ) : null}
                </div>
              </div>
            )}

            {error ? (
              <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200">
                {error}
              </div>
            ) : null}
            {status ? (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200">
                {status}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border-dark px-6 py-4">
          {saved ? (
            <span className="mr-auto inline-flex items-center gap-1 text-xs text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              已保存
            </span>
          ) : null}
          <UiButton type="button" variant="primary" className="gap-1.5" onClick={save}>
            <Save className="h-3.5 w-3.5" />
            保存
          </UiButton>
        </div>
      </div>
    </div>
  );
}
