import { customHttpRequest, type CustomHttpMultipartBody } from '@/commands/ai';
import {
  DEFAULT_IMAGE_HOST_SETTINGS,
  normalizeImageHostSettings,
  type ImageHostSettings,
} from '@/stores/settingsStore';
import { imageUrlToDataUrl } from './imageData';

const HTTP_URL_PATTERN = /^https?:\/\//i;

function joinApiPath(baseUrl: string, path: string): string {
  return `${baseUrl.trim().replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

function parseJsonResponse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('图床返回内容不是有效 JSON。');
  }
}

function asPlainRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function extractStringByPath(value: unknown, path: string): string | null {
  let current: unknown = value;
  for (const part of path.split('.')) {
    const record = asPlainRecord(current);
    if (!record) {
      return null;
    }
    current = record[part];
  }
  return typeof current === 'string' && current.trim() ? current.trim() : null;
}

function firstStringByPath(value: unknown, paths: string[]): string | null {
  for (const path of paths) {
    const found = extractStringByPath(value, path);
    if (found) {
      return found;
    }
  }
  return null;
}

function dataUrlExtension(dataUrl: string): string {
  const match = /^data:image\/([a-z0-9.+-]+);/i.exec(dataUrl);
  const raw = match?.[1]?.toLowerCase() ?? '';
  if (raw === 'jpeg') return 'jpg';
  if (raw === 'png' || raw === 'jpg' || raw === 'webp' || raw === 'gif' || raw === 'bmp' || raw === 'avif') {
    return raw;
  }
  return 'png';
}

function imageFileFromDataUrl(dataUrl: string, index: number, fieldName: string): NonNullable<CustomHttpMultipartBody['files']>[number] {
  const extension = dataUrlExtension(dataUrl);
  return {
    name: fieldName,
    fileName: `reference-${index + 1}.${extension}`,
    dataUrl,
  };
}

async function uploadToPixhost(source: string, index: number, settings: ImageHostSettings): Promise<string> {
  const dataUrl = await imageUrlToDataUrl(source);
  const response = await customHttpRequest({
    url: joinApiPath(settings.pixhost.apiBaseUrl, '/images'),
    method: 'POST',
    headers: {
      Accept: 'application/json',
    },
    bodyMode: 'multipart',
    multipart: {
      fields: [
        { name: 'content_type', value: settings.pixhost.contentType || DEFAULT_IMAGE_HOST_SETTINGS.pixhost.contentType },
        { name: 'max_th_size', value: settings.pixhost.maxThumbnailSize || DEFAULT_IMAGE_HOST_SETTINGS.pixhost.maxThumbnailSize },
      ],
      files: [imageFileFromDataUrl(dataUrl, index, 'img')],
    },
    timeoutMs: 60000,
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`PiXhost 上传失败：HTTP ${response.status}`);
  }
  const parsed = parseJsonResponse(response.text);
  const url = firstStringByPath(parsed, [
    'show_url',
    'image.show_url',
    'data.show_url',
    'data.url',
    'url',
  ]);
  if (!url) {
    throw new Error('PiXhost 上传成功但没有返回图片 URL。');
  }
  return url;
}

async function uploadToSeedvault(source: string, index: number, settings: ImageHostSettings): Promise<string> {
  const token = settings.seedvault.token.trim();
  if (!token) {
    throw new Error('私域图床缺少 token，请先在设置里保存账号密码生成 token。');
  }
  const dataUrl = await imageUrlToDataUrl(source);
  const fields: NonNullable<CustomHttpMultipartBody['fields']> = [];
  if (settings.seedvault.strategyId.trim()) {
    fields.push({ name: 'strategy_id', value: settings.seedvault.strategyId.trim() });
  }
  const response = await customHttpRequest({
    url: joinApiPath(settings.seedvault.apiBaseUrl, '/upload'),
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    bodyMode: 'multipart',
    multipart: {
      fields,
      files: [imageFileFromDataUrl(dataUrl, index, 'file')],
    },
    timeoutMs: 60000,
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`私域图床上传失败：HTTP ${response.status}`);
  }
  const parsed = parseJsonResponse(response.text);
  const url = firstStringByPath(parsed, [
    'data.links.url',
    'data.url',
    'url',
  ]);
  if (!url) {
    throw new Error('私域图床上传成功但没有返回图片 URL。');
  }
  return url;
}

export async function uploadImageToConfiguredHost(
  source: string,
  index: number,
  rawSettings: ImageHostSettings
): Promise<string> {
  const settings = normalizeImageHostSettings(rawSettings);
  if (!settings.enabled) {
    throw new Error('当前模型要求参考图使用图床 URL，请先在设置里勾选启用图床。');
  }
  if (HTTP_URL_PATTERN.test(source.trim())) {
    return source.trim();
  }
  return settings.provider === 'seedvault'
    ? uploadToSeedvault(source, index, settings)
    : uploadToPixhost(source, index, settings);
}
