import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const { customHttpRequestMock } = vi.hoisted(() => ({
  customHttpRequestMock: vi.fn(),
}));

vi.mock('@/commands/ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/commands/ai')>();
  return {
    ...actual,
    customHttpRequest: customHttpRequestMock,
  };
});

import { useCustomProvidersStore, type CustomProviderConfig } from '@/stores/customProvidersStore';
import {
  buildCustomProviderRequestDebugPreview,
  getCustomProviderJob,
  submitCustomProviderJob,
} from './customProviderGateway';

const storageValues = new Map<string, string>();

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
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storageValues.get(key) ?? null,
      setItem: (key: string, value: string) => storageValues.set(key, value),
      removeItem: (key: string) => storageValues.delete(key),
      clear: () => storageValues.clear(),
      key: (index: number) => Array.from(storageValues.keys())[index] ?? null,
      get length() { return storageValues.size; },
    } satisfies Storage,
  });
});

afterEach(() => {
  useCustomProvidersStore.getState().replaceAll([]);
  storageValues.clear();
  customHttpRequestMock.mockReset();
});

function imageEditRequest(providerId = 'provider-1', modelName = 'gpt-image-2') {
  return {
    prompt: 'edit this image',
    model: `custom:${providerId}:${modelName}`,
    size: '1024x1024',
    aspect_ratio: '1:1',
    reference_images: [`data:image/png;base64,${'a'.repeat(400)}`],
  };
}

function response(status: number, payload: unknown) {
  return Promise.resolve({ status, text: JSON.stringify(payload) });
}

async function waitForTerminalJob(jobId: string) {
  await vi.waitFor(() => {
    expect(getCustomProviderJob(jobId).status).not.toBe('running');
  });
  return getCustomProviderJob(jobId);
}

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

describe('custom provider image edit compatibility negotiation', () => {
  it('retries the same configured profile once for an empty-model rejection without learning an alternate', async () => {
    useCustomProvidersStore.getState().replaceAll([provider({
      endpointPath: '/images/edits',
      extraParams: {
        requestBodyMode: 'multipart',
        multipart: { enabled: true, fileField: 'image' },
      },
    })]);
    customHttpRequestMock
      .mockImplementationOnce(() => response(400, { error: { message: 'Model name not specified, model name cannot be empty' } }))
      .mockImplementationOnce(() => response(200, { data: [{ b64_json: 'a'.repeat(400) }] }));

    const job = await waitForTerminalJob(await submitCustomProviderJob(imageEditRequest()));

    expect(job.status).toBe('succeeded');
    expect(customHttpRequestMock).toHaveBeenCalledTimes(2);
    expect(customHttpRequestMock.mock.calls.map(([request]) => request.multipart.files[0].name)).toEqual([
      'image',
      'image',
    ]);
    expect(storageValues.get('custom-provider-image-edit-compatibility:v1')).toBeUndefined();
  });

  it('falls back to the OpenAI array profile after a recognized validation rejection and reuses it', async () => {
    useCustomProvidersStore.getState().replaceAll([provider({
      endpointPath: '/images/edits',
      extraParams: {
        requestBodyMode: 'multipart',
        multipart: { enabled: true, fileField: 'image' },
      },
    })]);
    customHttpRequestMock
      .mockImplementationOnce(() => response(400, { error: { message: 'missing image file field' } }))
      .mockImplementationOnce(() => response(200, { data: [{ b64_json: 'a'.repeat(400) }] }));

    expect((await waitForTerminalJob(await submitCustomProviderJob(imageEditRequest()))).status).toBe('succeeded');
    expect(customHttpRequestMock.mock.calls.map(([request]) => request.multipart.files[0].name)).toEqual([
      'image',
      'image[]',
    ]);

    const learned = storageValues.get('custom-provider-image-edit-compatibility:v1');
    expect(learned).toContain('openai-array');
    expect(learned).not.toContain('secret');
    expect(learned).not.toContain('edit this image');
    expect(learned).not.toContain('aaaa');

    customHttpRequestMock.mockReset();
    customHttpRequestMock.mockImplementationOnce(() => response(200, { data: [{ b64_json: 'a'.repeat(400) }] }));
    expect((await waitForTerminalJob(await submitCustomProviderJob(imageEditRequest()))).status).toBe('succeeded');
    expect(customHttpRequestMock).toHaveBeenCalledTimes(1);
    expect(customHttpRequestMock.mock.calls[0][0].multipart.files[0].name).toBe('image[]');
  });

  it('uses a single-file minimal profile when the configured profile already uses image[]', async () => {
    useCustomProvidersStore.getState().replaceAll([provider({
      endpointPath: '/images/edits',
      extraParams: {
        requestBodyMode: 'multipart',
        defaultRequestParams: { quality: 'auto', output_format: 'png' },
        multipart: { enabled: true, fileField: 'image[]' },
        requestBodyHints: {
          modelField: 'input.model_name',
          promptField: 'input.prompt',
        },
      },
    })]);
    customHttpRequestMock
      .mockImplementationOnce(() => response(400, { error: { message: 'unsupported parameter output_format' } }))
      .mockImplementationOnce(() => response(200, { data: [{ b64_json: 'a'.repeat(400) }] }));

    expect((await waitForTerminalJob(await submitCustomProviderJob(imageEditRequest()))).status).toBe('succeeded');
    expect(customHttpRequestMock).toHaveBeenCalledTimes(2);
    const fallbackMultipart = customHttpRequestMock.mock.calls[1][0].multipart;
    expect(fallbackMultipart.files).toHaveLength(1);
    expect(fallbackMultipart.files[0].name).toBe('image');
    expect(fallbackMultipart.fields.map((field: { name: string }) => field.name).sort()).toEqual([
      'model',
      'n',
      'prompt',
      'size',
    ]);
  });

  it.each([
    ['network failure', () => Promise.reject(new Error('connection timed out'))],
    ['HTTP 408', () => response(408, { error: 'timeout' })],
    ['HTTP 429', () => response(429, { error: 'rate limited' })],
    ['HTTP 500', () => response(500, { error: 'upstream error' })],
    ['unrecognized HTTP 400', () => response(400, { error: 'generation rejected' })],
    ['response content-type HTTP 400', () => response(400, {
      error: 'upstream response content-type text/html after processing',
    })],
    ['no generated image HTTP 400', () => response(400, {
      error: 'no image was generated by the upstream service',
    })],
  ])('never negotiates after %s', async (_label, implementation) => {
    useCustomProvidersStore.getState().replaceAll([provider({
      endpointPath: '/images/edits',
      extraParams: {
        requestBodyMode: 'multipart',
        multipart: { enabled: true, fileField: 'image' },
      },
    })]);
    customHttpRequestMock.mockImplementationOnce(implementation);

    const job = await waitForTerminalJob(await submitCustomProviderJob(imageEditRequest()));

    expect(job.status).toBe('failed');
    expect(customHttpRequestMock).toHaveBeenCalledTimes(1);
  });

  it('negotiates after an explicit request multipart content-type validation rejection', async () => {
    useCustomProvidersStore.getState().replaceAll([provider({
      endpointPath: '/images/edits',
      extraParams: {
        requestBodyMode: 'multipart',
        multipart: { enabled: true, fileField: 'image' },
      },
    })]);
    customHttpRequestMock
      .mockImplementationOnce(() => response(400, {
        error: 'request Content-Type must be multipart/form-data',
      }))
      .mockImplementationOnce(() => response(200, { data: [{ b64_json: 'a'.repeat(400) }] }));

    const job = await waitForTerminalJob(await submitCustomProviderJob(imageEditRequest()));

    expect(job.status).toBe('succeeded');
    expect(customHttpRequestMock).toHaveBeenCalledTimes(2);
  });

  it('does not learn an alternate profile from an HTTP 200 application-level failure', async () => {
    useCustomProvidersStore.getState().replaceAll([provider({
      endpointPath: '/images/edits',
      extraParams: {
        requestBodyMode: 'multipart',
        multipart: { enabled: true, fileField: 'image' },
      },
    })]);
    customHttpRequestMock
      .mockImplementationOnce(() => response(400, { error: 'missing image file field' }))
      .mockImplementationOnce(() => response(200, {
        code: 400,
        message: 'invalid request field',
      }));

    const job = await waitForTerminalJob(await submitCustomProviderJob(imageEditRequest()));

    expect(job.status).toBe('failed');
    expect(customHttpRequestMock).toHaveBeenCalledTimes(2);
    expect(storageValues.get('custom-provider-image-edit-compatibility:v1')).toBeUndefined();
  });

  it('caps the empty-model path at one same-profile retry and one alternate attempt', async () => {
    useCustomProvidersStore.getState().replaceAll([provider({
      endpointPath: '/images/edits',
      extraParams: {
        requestBodyMode: 'multipart',
        multipart: { enabled: true, fileField: 'image' },
      },
    })]);
    customHttpRequestMock.mockImplementation(() => response(400, {
      error: { message: 'Model name not specified, model name cannot be empty' },
    }));

    const job = await waitForTerminalJob(await submitCustomProviderJob(imageEditRequest()));

    expect(job.status).toBe('failed');
    expect(customHttpRequestMock).toHaveBeenCalledTimes(3);
    expect(customHttpRequestMock.mock.calls.map(([request]) => request.multipart.files[0].name)).toEqual([
      'image',
      'image',
      'image[]',
    ]);
    expect(job.error).toContain('configured');
    expect(job.error).toContain('openai-array');
  });

  it.each([
    {
      label: 'provider base URL',
      mutate: (cfg: CustomProviderConfig) => ({ ...cfg, baseUrl: 'https://other.example.com/v1' }),
      request: () => imageEditRequest(),
      expectedFileField: 'image',
    },
    {
      label: 'edit endpoint',
      mutate: (cfg: CustomProviderConfig) => ({ ...cfg, endpointPath: '/v2/images/edits' }),
      request: () => imageEditRequest(),
      expectedFileField: 'image',
    },
    {
      label: 'model family',
      mutate: (cfg: CustomProviderConfig) => cfg,
      request: () => imageEditRequest('provider-1', 'gpt-image-3'),
      expectedFileField: 'image',
    },
    {
      label: 'multipart configuration',
      mutate: (cfg: CustomProviderConfig) => ({
        ...cfg,
        extraParams: {
          ...cfg.extraParams,
          multipart: { enabled: true, fileField: 'custom-image' },
        },
      }),
      request: () => imageEditRequest(),
      expectedFileField: 'custom-image',
    },
    {
      label: 'default request parameter value',
      mutate: (cfg: CustomProviderConfig) => ({
        ...cfg,
        extraParams: {
          ...cfg.extraParams,
          defaultRequestParams: { quality: 'hd' },
        },
      }),
      request: () => imageEditRequest(),
      expectedFileField: 'image',
    },
    {
      label: 'provider route query',
      mutate: (cfg: CustomProviderConfig) => ({
        ...cfg,
        queryParams: { channel: 'secondary' },
      }),
      request: () => imageEditRequest(),
      expectedFileField: 'image',
    },
  ])('invalidates learned selection when $label changes', async ({ mutate, request, expectedFileField }) => {
    const initialProvider = provider({
      endpointPath: '/images/edits',
      queryParams: { channel: 'primary' },
      extraParams: {
        requestBodyMode: 'multipart',
        defaultRequestParams: { quality: 'auto' },
        multipart: { enabled: true, fileField: 'image' },
      },
    });
    useCustomProvidersStore.getState().replaceAll([initialProvider]);
    customHttpRequestMock
      .mockImplementationOnce(() => response(400, { error: { message: 'missing image file field' } }))
      .mockImplementationOnce(() => response(200, { data: [{ b64_json: 'a'.repeat(400) }] }));
    await waitForTerminalJob(await submitCustomProviderJob(imageEditRequest()));

    useCustomProvidersStore.getState().replaceAll([mutate(initialProvider)]);
    customHttpRequestMock.mockReset();
    customHttpRequestMock.mockImplementationOnce(() => response(200, { data: [{ b64_json: 'a'.repeat(400) }] }));
    await waitForTerminalJob(await submitCustomProviderJob(request()));

    expect(customHttpRequestMock.mock.calls[0][0].multipart.files[0].name).toBe(expectedFileField);
  });
});
