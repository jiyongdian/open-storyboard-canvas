import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { useCustomProvidersStore, type CustomProviderConfig } from '@/stores/customProvidersStore';
import { buildCustomProviderRequestDebugPreview } from './customProviderGateway';

function provider(overrides: Partial<CustomProviderConfig> = {}): CustomProviderConfig {
  return {
    id: 'provider-1',
    label: 'Provider',
    baseUrl: 'https://example.com/v1',
    endpointPath: '/images/generations',
    httpMethod: 'POST',
    apiKey: 'secret',
    apiStyle: 'openai-compatible',
    models: ['gpt-image-2'],
    supportsWebSearch: false,
    responseFormat: 'openai-images',
    ...overrides,
  };
}

beforeAll(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
      key: (index: number) => Array.from(values.keys())[index] ?? null,
      get length() { return values.size; },
    } satisfies Storage,
  });
});

afterEach(() => {
  useCustomProvidersStore.getState().replaceAll([]);
});

describe('custom provider image request contracts', () => {
  it('rejects an empty compound upstream model before composing a request', () => {
    useCustomProvidersStore.getState().replaceAll([provider()]);
    expect(() => buildCustomProviderRequestDebugPreview({
      prompt: 'draw',
      model: 'custom:provider-1:   ',
      size: '1024x1024',
      aspect_ratio: 'auto',
    })).toThrow('未找到对应的自定义服务商配置');
  });

  it('prevents legacy defaults and node extras from replacing canonical fields', () => {
    useCustomProvidersStore.getState().replaceAll([provider({
      extraParams: {
        defaultRequestParams: {
          model: '',
          prompt: 'wrong default prompt',
          size: '1x1',
        },
      },
    })]);
    const preview = buildCustomProviderRequestDebugPreview({
      prompt: 'real prompt',
      model: 'custom:provider-1:gpt-image-2',
      size: '2048x2048',
      aspect_ratio: 'auto',
      extra_params: {
        model: '',
        prompt: 'wrong node prompt',
        size: '1x1',
        resolutionType: '2048x2048',
      },
    });

    expect(preview.body).toEqual(expect.objectContaining({
      model: 'gpt-image-2',
      prompt: 'real prompt',
      size: '2048x2048',
    }));
  });

  it('keeps a real model binding in legacy multipart even when modelField is blank', () => {
    useCustomProvidersStore.getState().replaceAll([provider({
      endpointPath: '/images/edits',
      extraParams: {
        requestBodyMode: 'multipart',
        requestBodyHints: { modelField: '', referenceImageField: 'image' },
        multipart: { enabled: true, fileField: 'image' },
      },
    })]);
    const preview = buildCustomProviderRequestDebugPreview({
      prompt: 'edit',
      model: 'custom:provider-1:gpt-image-2',
      size: '1024x1024',
      aspect_ratio: '1:1',
      reference_images: [`data:image/png;base64,${'a'.repeat(400)}`],
    });

    expect(preview.multipart).toEqual(expect.objectContaining({
      fields: expect.arrayContaining([
        expect.objectContaining({ name: 'model', value: 'gpt-image-2' }),
      ]),
    }));
  });

  it('restores a configured nested legacy model field after empty overrides', () => {
    useCustomProvidersStore.getState().replaceAll([provider({
      endpointPath: '/images/edits',
      extraParams: {
        requestBodyMode: 'multipart',
        defaultRequestParams: { input: { model_name: '' } },
        requestBodyHints: { modelField: 'input.model_name', referenceImageField: 'image' },
        multipart: { enabled: true, fileField: 'image' },
      },
    })]);
    const preview = buildCustomProviderRequestDebugPreview({
      prompt: 'edit',
      model: 'custom:provider-1:gpt-image-2',
      size: '1024x1024',
      aspect_ratio: '1:1',
      reference_images: [`data:image/png;base64,${'a'.repeat(400)}`],
    });

    expect(preview.multipart).toEqual(expect.objectContaining({
      fields: expect.arrayContaining([
        expect.objectContaining({ name: 'input.model_name', value: 'gpt-image-2' }),
      ]),
    }));
  });
});
