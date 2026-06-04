import type { CustomProviderConfig } from '@/stores/customProvidersStore';

export type CustomProviderBodyMode = 'json' | 'multipart' | 'form-urlencoded' | 'signed';

const NEGATED_MULTIPART_PATTERN = /(不需要|无需|不是|非|without|no|not).{0,16}(multipart|form-data|文件流|文件上传)/i;
const NEGATED_FORM_URLENCODED_PATTERN = /(不需要|无需|不是|非|without|no|not).{0,16}(application\/x-www-form-urlencoded|x-www-form-urlencoded|form-?url-?encoded|url-?encoded)/i;
const NEGATED_SIGNED_PATTERN = /(不需要|无需|不是|非|without|no|not).{0,16}(signed|signature|签名|鉴权)/i;
const JSON_BODY_TEMPLATE_KEYS = new Set([
  'openai_images',
  'openai_proxy',
  'openai_chat_image',
  'openai_responses_chat',
  'openai_chat_completions',
  'anthropic_messages',
  'google_gemini_chat',
  'agnes_chat',
  'openai_responses_image',
  'grsai_draw_async',
  'fal',
  'fal_queue_async',
  'replicate_prediction_async',
  'generic_async_poll',
]);

export function asPlainRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizedToken(value: unknown): string {
  return stringValue(value).toLowerCase();
}

function markerModeFromValue(value: unknown): CustomProviderBodyMode | null {
  const token = normalizedToken(value);
  if (!token) return null;
  if (token === 'multipart' || token === 'multipart/form-data' || token.includes('multipart')) {
    return 'multipart';
  }
  if (
    token === 'form'
    || token === 'urlencoded'
    || token === 'url-encoded'
    || token === 'form-urlencoded'
    || token === 'form-url-encoded'
    || token === 'x-www-form-urlencoded'
    || token === 'application/x-www-form-urlencoded'
    || token.includes('x-www-form-urlencoded')
    || token.includes('form-urlencoded')
    || token.includes('form-url-encoded')
    || token.includes('urlencoded')
  ) {
    return 'form-urlencoded';
  }
  if (token === 'signed' || token === 'signed-auth' || token.includes('signed')) {
    return 'signed';
  }
  return null;
}

function importPlanFromExtraParams(extraParams: Record<string, unknown> | null): Record<string, unknown> | null {
  return asPlainRecord(extraParams?.importPlan);
}

function requestPlanFromImportLike(importLike: Record<string, unknown> | null): Record<string, unknown> | null {
  return asPlainRecord(importLike?.requestPlan);
}

function compatibilityFromImportLike(importLike: Record<string, unknown> | null): Record<string, unknown> | null {
  return asPlainRecord(importLike?.compatibility);
}

function requestBodyHintsFromImportLike(importLike: Record<string, unknown> | null): Record<string, unknown> | null {
  return asPlainRecord(asPlainRecord(importLike?.extraParams)?.requestBodyHints)
    ?? asPlainRecord(importLike?.requestBodyHints);
}

function endpointLooksLikeMultipartImageEdit(value: unknown): boolean {
  const endpoint = stringValue(value).toLowerCase();
  return endpoint.includes('/images/edits') || endpoint.includes('/image/edits') || endpoint.includes('/edits');
}

function hintedReferenceFieldLooksLikeMultipart(importLike: Record<string, unknown>): boolean {
  const hints = requestBodyHintsFromImportLike(importLike);
  const referenceImageField = normalizedToken(hints?.referenceImageField);
  if (!referenceImageField) return false;
  if (!/^(image|images|file|files)$/.test(referenceImageField)) return false;

  const templateKey = normalizedToken(importLike.templateKey);
  const apiStyle = normalizedToken(importLike.apiStyle);
  const endpoint = normalizedToken(importLike.endpointPath);
  const extraParams = asPlainRecord(importLike.extraParams);
  if (
    JSON_BODY_TEMPLATE_KEYS.has(templateKey)
    || apiStyle === 'fal'
    || apiStyle === 'replicate'
    || endpoint.includes('/images/generations')
    || endpoint.includes('/chat/completions')
    || endpoint.includes('/responses')
    || Boolean(asPlainRecord(extraParams?.asyncTask))
  ) {
    return false;
  }

  return true;
}

function includesMultipartText(...values: unknown[]): boolean {
  return values.some((value) => {
    const text = stringValue(value);
    if (!text || NEGATED_MULTIPART_PATTERN.test(text)) return false;
    return /multipart\/form-data|requires?.{0,24}multipart|需要.{0,24}multipart|file\s*upload|file\s*stream|文件流|文件上传/i.test(text);
  });
}

function includesFormUrlEncodedText(...values: unknown[]): boolean {
  return values.some((value) => {
    const text = stringValue(value);
    if (!text || NEGATED_FORM_URLENCODED_PATTERN.test(text)) return false;
    return /application\/x-www-form-urlencoded|x-www-form-urlencoded|form-?url-?encoded|url-?encoded/i.test(text);
  });
}

function includesSignedText(...values: unknown[]): boolean {
  return values.some((value) => {
    const text = stringValue(value);
    if (!text || NEGATED_SIGNED_PATTERN.test(text)) return false;
    return /signed.{0,24}(auth|request)|signature|ak\/sk|aksk|hmac|timestamp|需要.{0,24}签名|签名算法|专用鉴权/i.test(text);
  });
}

function importLikeHasFormUrlEncodedMarker(importLike: Record<string, unknown>): boolean {
  const requestPlan = requestPlanFromImportLike(importLike);
  if (markerModeFromValue(requestPlan?.mode) === 'form-urlencoded') return true;

  const compatibility = compatibilityFromImportLike(importLike);
  if (markerModeFromValue(compatibility?.risk) === 'form-urlencoded') return true;

  return includesFormUrlEncodedText(
    importLike.templateReason,
    importLike.note,
    requestPlan?.submit,
    requestPlan?.poll,
    compatibility?.reason,
  );
}

function importLikeHasSignedMarker(importLike: Record<string, unknown>): boolean {
  const templateKey = normalizedToken(importLike.templateKey);
  if (templateKey === 'signed_proxy_required') return true;

  const requestPlan = requestPlanFromImportLike(importLike);
  if (markerModeFromValue(requestPlan?.mode) === 'signed') return true;

  const compatibility = compatibilityFromImportLike(importLike);
  if (markerModeFromValue(compatibility?.risk) === 'signed') return true;

  return includesSignedText(
    importLike.templateReason,
    importLike.note,
    requestPlan?.submit,
    requestPlan?.poll,
    compatibility?.reason,
  );
}

function importLikeHasMultipartMarker(importLike: Record<string, unknown>): boolean {
  const templateKey = normalizedToken(importLike.templateKey);
  if (templateKey === 'multipart_proxy_required') return true;
  if (endpointLooksLikeMultipartImageEdit(importLike.endpointPath)) return true;
  if (normalizedToken(importLike.apiStyle) === 'stability') return true;

  const requestPlan = requestPlanFromImportLike(importLike);
  if (markerModeFromValue(requestPlan?.mode) === 'multipart') return true;

  const compatibility = compatibilityFromImportLike(importLike);
  if (markerModeFromValue(compatibility?.risk) === 'multipart') return true;

  if (includesMultipartText(
    importLike.templateReason,
    importLike.note,
    requestPlan?.submit,
    requestPlan?.poll,
    compatibility?.reason,
  )) {
    return true;
  }

  return hintedReferenceFieldLooksLikeMultipart(importLike);
}

function inferLegacyPresetMode(cfg: CustomProviderConfig): CustomProviderBodyMode | null {
  const label = cfg.label ?? '';
  const note = cfg.note ?? '';
  if (/Multipart 上传接口/i.test(label) || /该服务商需要\s*multipart\/form-data|该服务商需要.*文件流|该服务商需要.*文件上传/i.test(note)) {
    return 'multipart';
  }
  if (/Form URL-encoded|表单 URL 编码/i.test(label) || includesFormUrlEncodedText(note)) {
    return 'form-urlencoded';
  }
  if (/签名鉴权接口|云厂商签名图像接口/i.test(label) || /该服务商需要.*签名算法|该服务商需要.*AK\/SK|该服务商需要.*专用鉴权/i.test(note)) {
    return 'signed';
  }
  return null;
}

function inferModeFromImportLike(importLike: Record<string, unknown> | null): CustomProviderBodyMode | null {
  if (!importLike) return null;
  // Signed/proxy requirements are not executable by the generic direct
  // transport. Prefer blocking those imports even if the payload also uses
  // multipart fields.
  if (importLikeHasSignedMarker(importLike)) return 'signed';
  if (importLikeHasMultipartMarker(importLike)) return 'multipart';
  if (importLikeHasFormUrlEncodedMarker(importLike)) return 'form-urlencoded';
  return null;
}

export function inferImportedBodyMode(block: Record<string, unknown>): CustomProviderBodyMode | null {
  if (importLikeHasSignedMarker(block)) return 'signed';

  const directMode =
    markerModeFromValue(block.requestBodyMode)
    ?? markerModeFromValue(block.bodyMode)
    ?? markerModeFromValue(block.transport);
  if (directMode) return directMode;

  const extraParams = asPlainRecord(block.extraParams);
  const extraMode =
    markerModeFromValue(extraParams?.requestBodyMode)
    ?? markerModeFromValue(extraParams?.bodyMode)
    ?? markerModeFromValue(extraParams?.transport);
  if (extraMode) return extraMode;

  return inferModeFromImportLike(block);
}

export function resolveRequestBodyHints(extraParams: Record<string, unknown> | null): Record<string, unknown> | null {
  return asPlainRecord(extraParams?.requestBodyHints);
}

export function resolveMultipartFileFieldFromExtraParams(extraParams: Record<string, unknown> | null): string {
  const multipart = asPlainRecord(extraParams?.multipart);
  const configuredField = stringValue(multipart?.fileField);
  if (configuredField) return configuredField;

  const hints = resolveRequestBodyHints(extraParams);
  const hintedField = stringValue(hints?.referenceImageField);
  return hintedField || 'image';
}

export function normalizeImportedExtraParamsForTransport(
  extraParams: Record<string, unknown>,
  importLike: Record<string, unknown>,
): Record<string, unknown> {
  const mode = inferImportedBodyMode({
    ...importLike,
    extraParams,
  });
  if (!mode) return extraParams;

  if (mode === 'multipart') {
    const multipart = asPlainRecord(extraParams.multipart) ?? {};
    const fileField = stringValue(multipart.fileField)
      || resolveMultipartFileFieldFromExtraParams(extraParams)
      || 'image';
    return {
      ...extraParams,
      requestBodyMode: 'multipart',
      multipart: {
        enabled: true,
        ...multipart,
        fileField,
      },
    };
  }

  if (mode === 'form-urlencoded') {
    const next = { ...extraParams };
    delete next.multipart;
    delete next.signedAuth;
    delete next.transport;
    delete next.needsProxy;
    delete next.bodyMode;
    return {
      ...next,
      requestBodyMode: 'form-urlencoded',
    };
  }

  return {
    ...extraParams,
    transport: 'signed',
    needsProxy: true,
    signedAuth: {
      required: true,
      ...(asPlainRecord(extraParams.signedAuth) ?? {}),
    },
  };
}

export function resolveCustomProviderBodyMode(
  cfg: CustomProviderConfig,
  requestExtraParams?: Record<string, unknown>,
): CustomProviderBodyMode {
  const configExtra = asPlainRecord(cfg.extraParams) ?? {};
  const requestExtra = requestExtraParams ?? {};
  const importPlan = importPlanFromExtraParams(configExtra);
  const signedAuth = asPlainRecord(configExtra.signedAuth);
  const directMode =
    markerModeFromValue(requestExtra.requestBodyMode)
    ?? markerModeFromValue(requestExtra.bodyMode)
    ?? markerModeFromValue(requestExtra.transport)
    ?? markerModeFromValue(configExtra.requestBodyMode)
    ?? markerModeFromValue(configExtra.bodyMode)
    ?? markerModeFromValue(configExtra.transport);
  if (directMode) return directMode;

  if (
    signedAuth?.required === true
    || configExtra.needsProxy === true
    || (importPlan ? importLikeHasSignedMarker(importPlan) : false)
  ) {
    return 'signed';
  }

  const multipart = asPlainRecord(configExtra.multipart);
  if (multipart?.enabled === true) return 'multipart';

  const importMode = inferModeFromImportLike(importPlan);
  if (importMode) return importMode;

  const endpoint = (cfg.endpointPath ?? '').toLowerCase();
  if (cfg.apiStyle === 'stability') return 'multipart';
  if (cfg.apiStyle === 'openai-compatible' && endpoint.includes('/images/edits')) {
    return 'multipart';
  }
  if (hintedReferenceFieldLooksLikeMultipart({
    ...(importPlan ?? {}),
    apiStyle: cfg.apiStyle,
    endpointPath: cfg.endpointPath,
    extraParams: configExtra,
  })) {
    return 'multipart';
  }
  const legacyMode = inferLegacyPresetMode(cfg);
  if (legacyMode) return legacyMode;

  return 'json';
}

export function resolveCustomProviderMultipartFileField(cfg: CustomProviderConfig): string {
  return resolveMultipartFileFieldFromExtraParams(asPlainRecord(cfg.extraParams));
}

export function getImportPlanRequiredFields(cfg: CustomProviderConfig): string[] {
  const extraParams = asPlainRecord(cfg.extraParams);
  const requestPlan = requestPlanFromImportLike(importPlanFromExtraParams(extraParams));
  const raw = requestPlan?.requiredFields;
  if (!Array.isArray(raw)) return [];
  return raw.map(String).map((value) => value.trim()).filter(Boolean);
}

export function requiresMultipartReferenceImage(cfg: CustomProviderConfig): boolean {
  const endpoint = (cfg.endpointPath ?? '').toLowerCase();
  if (endpoint.includes('/images/edits') || endpoint.includes('/edits')) {
    return true;
  }
  return getImportPlanRequiredFields(cfg).some((field) => /(^|[_\-.])(image|images|file|files)($|[_\-.])/i.test(field));
}
