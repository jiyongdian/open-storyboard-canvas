export type AudioParameterKind = 'boolean' | 'number' | 'text';

export interface AudioTextInputSchema {
  enabled: boolean;
  required: boolean;
  field: string;
  label: string;
  placeholder: string;
}

export interface AudioVoiceInputSchema {
  enabled: boolean;
}

export interface AudioReferenceAudioInputSchema {
  enabled: boolean;
  min: number;
  max: number;
  field: string;
}

export interface AudioControlInstructionInputSchema {
  enabled: boolean;
  required: boolean;
  field: string;
  label: string;
  placeholder: string;
  disabledWhenPromptText: boolean;
}

export interface AudioPromptTextInputSchema {
  enabled: boolean;
  toggleField: string;
  field: string;
  label: string;
  placeholder: string;
  requiresReferenceAudio: boolean;
  disablesControlInstruction: boolean;
  requiredWhenEnabled: boolean;
}

export interface AudioParameterSchema {
  key: string;
  label: string;
  kind: AudioParameterKind;
  defaultValue: string | number | boolean;
  description?: string;
  min?: number;
  max?: number;
  step?: number;
}

export interface AudioInputSchema {
  text: AudioTextInputSchema;
  voice: AudioVoiceInputSchema;
  referenceAudio: AudioReferenceAudioInputSchema;
  controlInstruction: AudioControlInstructionInputSchema;
  promptText: AudioPromptTextInputSchema;
  parameters: AudioParameterSchema[];
}

const MAX_REFERENCE_AUDIO = 9;
const MAX_AUDIO_PARAMETERS = 24;

export const DEFAULT_AUDIO_INPUT_SCHEMA: AudioInputSchema = {
  text: {
    enabled: true,
    required: true,
    field: 'text',
    label: '生成文本',
    placeholder: '输入要生成的音频文本，也可以连接文本节点作为输入',
  },
  voice: {
    enabled: true,
  },
  referenceAudio: {
    enabled: false,
    min: 0,
    max: 0,
    field: '',
  },
  controlInstruction: {
    enabled: false,
    required: false,
    field: 'controlInstruction',
    label: '生成控制',
    placeholder: '',
    disabledWhenPromptText: false,
  },
  promptText: {
    enabled: false,
    toggleField: 'usePromptText',
    field: 'promptTextValue',
    label: '参考音频文本',
    placeholder: '',
    requiresReferenceAudio: false,
    disablesControlInstruction: false,
    requiredWhenEnabled: false,
  },
  parameters: [],
};

function asPlainRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function cloneSchema(schema: AudioInputSchema): AudioInputSchema {
  return {
    text: { ...schema.text },
    voice: { ...schema.voice },
    referenceAudio: { ...schema.referenceAudio },
    controlInstruction: { ...schema.controlInstruction },
    promptText: { ...schema.promptText },
    parameters: schema.parameters.map((parameter) => ({ ...parameter })),
  };
}

function normalizeString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

function clampNumber(value: unknown, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeTextSchema(value: unknown, fallback: AudioTextInputSchema): AudioTextInputSchema {
  const raw = asPlainRecord(value);
  const enabled = raw?.enabled === undefined ? fallback.enabled : raw.enabled === true;
  return {
    enabled,
    required: enabled ? normalizeBoolean(raw?.required, fallback.required) : false,
    field: normalizeString(raw?.field, fallback.field),
    label: normalizeString(raw?.label, fallback.label),
    placeholder: normalizeString(raw?.placeholder, fallback.placeholder),
  };
}

function normalizeVoiceSchema(value: unknown, fallback: AudioVoiceInputSchema): AudioVoiceInputSchema {
  const raw = asPlainRecord(value);
  return {
    enabled: raw?.enabled === undefined ? fallback.enabled : raw.enabled === true,
  };
}

function normalizeReferenceAudioSchema(
  value: unknown,
  fallback: AudioReferenceAudioInputSchema
): AudioReferenceAudioInputSchema {
  const raw = asPlainRecord(value);
  const enabled = raw?.enabled === undefined ? fallback.enabled : raw.enabled === true;
  const fallbackMax = enabled ? fallback.max : 0;
  const max = clampInteger(raw?.max, fallbackMax, 0, MAX_REFERENCE_AUDIO);
  const min = clampInteger(raw?.min, fallback.min, 0, max);
  return {
    enabled,
    min: enabled ? min : 0,
    max: enabled ? max : 0,
    field: normalizeString(raw?.field, fallback.field),
  };
}

function normalizeControlInstructionSchema(
  value: unknown,
  fallback: AudioControlInstructionInputSchema
): AudioControlInstructionInputSchema {
  const raw = asPlainRecord(value);
  const enabled = raw?.enabled === undefined ? fallback.enabled : raw.enabled === true;
  return {
    enabled,
    required: enabled ? normalizeBoolean(raw?.required, fallback.required) : false,
    field: normalizeString(raw?.field, fallback.field),
    label: normalizeString(raw?.label, fallback.label),
    placeholder: normalizeString(raw?.placeholder, fallback.placeholder),
    disabledWhenPromptText: normalizeBoolean(
      raw?.disabledWhenPromptText,
      fallback.disabledWhenPromptText
    ),
  };
}

function normalizePromptTextSchema(
  value: unknown,
  fallback: AudioPromptTextInputSchema
): AudioPromptTextInputSchema {
  const raw = asPlainRecord(value);
  const enabled = raw?.enabled === undefined ? fallback.enabled : raw.enabled === true;
  return {
    enabled,
    toggleField: normalizeString(raw?.toggleField, fallback.toggleField),
    field: normalizeString(raw?.field, fallback.field),
    label: normalizeString(raw?.label, fallback.label),
    placeholder: normalizeString(raw?.placeholder, fallback.placeholder),
    requiresReferenceAudio: normalizeBoolean(raw?.requiresReferenceAudio, fallback.requiresReferenceAudio),
    disablesControlInstruction: normalizeBoolean(
      raw?.disablesControlInstruction,
      fallback.disablesControlInstruction
    ),
    requiredWhenEnabled: enabled
      ? normalizeBoolean(raw?.requiredWhenEnabled, fallback.requiredWhenEnabled)
      : false,
  };
}

function normalizeParameterKind(value: unknown, fallback: AudioParameterKind): AudioParameterKind {
  return value === 'boolean' || value === 'number' || value === 'text' ? value : fallback;
}

function normalizeParameterDefaultValue(
  value: unknown,
  kind: AudioParameterKind,
  fallback: AudioParameterSchema['defaultValue']
): AudioParameterSchema['defaultValue'] {
  if (kind === 'boolean') {
    return typeof value === 'boolean' ? value : Boolean(fallback);
  }
  if (kind === 'number') {
    return clampNumber(value, typeof fallback === 'number' ? fallback : 0);
  }
  return typeof value === 'string' ? value : String(fallback ?? '');
}

function normalizeParameter(value: unknown): AudioParameterSchema | null {
  const raw = asPlainRecord(value);
  if (!raw) {
    return null;
  }
  const key = normalizeString(raw.key, '');
  if (!key) {
    return null;
  }
  const kind = normalizeParameterKind(raw.kind, 'text');
  const fallbackDefault = kind === 'boolean' ? false : kind === 'number' ? 0 : '';
  const normalized: AudioParameterSchema = {
    key,
    label: normalizeString(raw.label, key),
    kind,
    defaultValue: normalizeParameterDefaultValue(raw.defaultValue, kind, fallbackDefault),
  };
  const description = normalizeString(raw.description, '');
  if (description) {
    normalized.description = description;
  }
  if (kind === 'number') {
    const min = raw.min === undefined ? undefined : clampNumber(raw.min, Number.NEGATIVE_INFINITY);
    const max = raw.max === undefined ? undefined : clampNumber(raw.max, Number.POSITIVE_INFINITY);
    if (typeof min === 'number' && Number.isFinite(min)) {
      normalized.min = min;
    }
    if (typeof max === 'number' && Number.isFinite(max)) {
      normalized.max = max;
    }
    const step = clampNumber(raw.step, 1);
    if (Number.isFinite(step) && step > 0) {
      normalized.step = step;
    }
  }
  return normalized;
}

function normalizeParameters(value: unknown, fallback: AudioParameterSchema[]): AudioParameterSchema[] {
  const source = Array.isArray(value) ? value : fallback;
  const seen = new Set<string>();
  const parameters: AudioParameterSchema[] = [];
  source.forEach((item) => {
    const parameter = normalizeParameter(item);
    if (!parameter || seen.has(parameter.key)) {
      return;
    }
    seen.add(parameter.key);
    parameters.push(parameter);
  });
  return parameters.slice(0, MAX_AUDIO_PARAMETERS);
}

export function normalizeAudioInputSchema(
  value: unknown,
  fallback: AudioInputSchema = DEFAULT_AUDIO_INPUT_SCHEMA
): AudioInputSchema {
  const raw = asPlainRecord(value);
  const base = cloneSchema(fallback);
  if (!raw) {
    return base;
  }
  return {
    text: normalizeTextSchema(raw.text, base.text),
    voice: normalizeVoiceSchema(raw.voice, base.voice),
    referenceAudio: normalizeReferenceAudioSchema(raw.referenceAudio, base.referenceAudio),
    controlInstruction: normalizeControlInstructionSchema(
      raw.controlInstruction,
      base.controlInstruction
    ),
    promptText: normalizePromptTextSchema(raw.promptText, base.promptText),
    parameters: normalizeParameters(raw.parameters, base.parameters),
  };
}

export function defaultAudioInputSchemaForProviderKind(providerKind: unknown): AudioInputSchema {
  const kind = typeof providerKind === 'string' ? providerKind.trim().toLowerCase() : '';
  if (kind === 'gradio-voxcpm') {
    return normalizeAudioInputSchema({
      text: {
        enabled: true,
        required: true,
        field: 'text',
        label: '目标文本',
        placeholder: '输入 VoxCPM 要朗读的文本',
      },
      voice: {
        enabled: false,
      },
      referenceAudio: {
        enabled: true,
        min: 0,
        max: 1,
        field: 'ref_wav',
      },
      controlInstruction: {
        enabled: true,
        required: false,
        field: 'controlInstruction',
        label: '生成控制',
        placeholder: '例如：年轻女声，自然、清晰、有表现力',
        disabledWhenPromptText: true,
      },
      promptText: {
        enabled: true,
        toggleField: 'usePromptText',
        field: 'promptTextValue',
        label: '参考音频文本',
        placeholder: 'Ultimate Cloning 模式下填写参考音频对应的原文',
        requiresReferenceAudio: true,
        disablesControlInstruction: true,
        requiredWhenEnabled: true,
      },
      parameters: [
        {
          key: 'cfgValue',
          label: 'CFG',
          kind: 'number',
          defaultValue: 2,
          description: '数值越高越贴合提示/参考音色；数值越低生成风格更自由',
          min: 1,
          max: 3,
          step: 0.1,
        },
        {
          key: 'ditSteps',
          label: 'DiT steps',
          kind: 'number',
          defaultValue: 10,
          description: '生成迭代步数，步数越多可能音质更好，但速度更慢',
          min: 1,
          max: 50,
          step: 1,
        },
        {
          key: 'doNormalize',
          label: '文本规范化',
          kind: 'boolean',
          defaultValue: false,
          description: '自动处理数字、符号等文本读法',
        },
        {
          key: 'denoise',
          label: '参考音频降噪',
          kind: 'boolean',
          defaultValue: false,
          description: '对参考音频做降噪，可能改善克隆稳定性',
        },
      ],
    });
  }

  return cloneSchema(DEFAULT_AUDIO_INPUT_SCHEMA);
}

export function resolveAudioInputSchemaFromExtraParams(
  extraParams: unknown,
  providerKind?: unknown
): AudioInputSchema {
  const params = asPlainRecord(extraParams);
  const fallback = defaultAudioInputSchemaForProviderKind(providerKind ?? params?.providerKind);
  return normalizeAudioInputSchema(params?.audioInputSchema, fallback);
}
