import { describe, expect, it } from 'vitest';

import {
  parseCustomProviderModelId,
  redactSensitiveUrl,
  resolveGenerationSubmissionRetryAttempts,
  selectImageResultCandidate,
  shouldForwardProviderCredentials,
} from './imageProviderContracts';

describe('parseCustomProviderModelId', () => {
  it('preserves colons inside a real upstream model name', () => {
    expect(parseCustomProviderModelId('custom:provider-1:vendor:model:v2')).toEqual({
      providerId: 'provider-1',
      upstreamModel: 'vendor:model:v2',
    });
  });

  it('rejects an empty upstream model', () => {
    expect(parseCustomProviderModelId('custom:provider-1:   ')).toBeNull();
  });
});

describe('selectImageResultCandidate', () => {
  it('prefers OpenAI image data over page/status URLs', () => {
    expect(selectImageResultCandidate({
      page_url: 'https://example.com/result/123',
      status_url: 'https://example.com/tasks/123',
      data: [{ url: 'https://cdn.example.com/generated/123.png?sig=secret' }],
    })).toEqual({
      source: 'https://cdn.example.com/generated/123.png?sig=secret',
      path: 'data[0].url',
      confidence: 'known-format',
    });
  });

  it('does not accept web pages merely because the field contains url', () => {
    expect(selectImageResultCandidate({
      web_url: 'https://example.com/result/123',
      request_url: 'https://example.com/tasks/123',
    })).toBeNull();
  });

  it('accepts extensionless signed URLs from explicit and known response paths', () => {
    const source = 'https://cdn.example.com/download/abc123?signature=secret';
    expect(selectImageResultCandidate({ result: { download: source } }, 'result.download')).toEqual({
      source,
      path: 'result.download',
      confidence: 'explicit',
    });
    expect(selectImageResultCandidate({ data: [{ url: source }] })).toEqual({
      source,
      path: 'data[0].url',
      confidence: 'known-format',
    });
  });
});

describe('redactSensitiveUrl', () => {
  it('redacts all query values while retaining a useful origin/path', () => {
    expect(redactSensitiveUrl('https://cdn.example.com/image.png?X-Amz-Signature=abc&token=def&width=1024'))
      .toBe('https://cdn.example.com/image.png?X-Amz-Signature=%5Bredacted%5D&token=%5Bredacted%5D&width=%5Bredacted%5D');
  });
});

describe('shouldForwardProviderCredentials', () => {
  it('forwards credentials only to the provider origin', () => {
    expect(shouldForwardProviderCredentials(
      'https://api.example.com/v1',
      'https://api.example.com/files/result.png',
    )).toBe(true);
    expect(shouldForwardProviderCredentials(
      'https://api.example.com/v1',
      'https://cdn.example.com/files/result.png',
    )).toBe(false);
  });
});

describe('resolveGenerationSubmissionRetryAttempts', () => {
  it('never replays a non-idempotent image POST automatically', () => {
    expect(resolveGenerationSubmissionRetryAttempts('POST')).toBe(0);
    expect(resolveGenerationSubmissionRetryAttempts('GET')).toBe(2);
  });
});
