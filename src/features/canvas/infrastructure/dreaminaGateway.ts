import { convertFileSrc, invoke } from '@tauri-apps/api/core';

import type { GenerateRequest, GenerationJobStatus } from '@/commands/ai';
import { loadAudioSourceDataUrl, persistVideoSource } from '@/commands/image';
import type { GenerateVideoPayload } from '../application/ports';

/**
 * Dreamina CLI image gateway (frontend side).
 *
 * The CLI runs synchronously with `--poll`, so a "job" here is just an
 * immediate blocking call; we store the final result in a module-level
 * cache keyed by a synthetic job id so the existing
 * submitGenerateImageJob / getGenerateImageJob polling flow used by the
 * rest of the app still works.
 *
 * Reference-image plumbing: Dreamina expects *local file paths*, not data
 * URLs, so we persist each incoming data URL as a temp file under the
 * app data dir before invoking the command.
 */

interface DreaminaBackendResult {
  ok: boolean;
  submitId?: string | null;
  stdout: string;
  stderr: string;
  error?: string | null;
}

const resultCache = new Map<string, GenerationJobStatus>();

/**
 * Take a data: URL / remote URL and stage it as a temp file via the Rust
 * side (`dreamina_stage_reference_image`), returning an absolute filesystem
 * path Dreamina CLI can read. Non-data URLs pass through — the upstream
 * `normalizeReferenceImages` layer is expected to have already converted
 * remote URLs to data URLs for dreamina:* model targets.
 */
async function stashRemoteOrDataUrlToTempFile(src: string, _idxHint: number): Promise<string> {
  if (!src.startsWith('data:')) return src;
  return await invoke<string>('dreamina_stage_reference_image', { dataUrl: src });
}

/**
 * Map Dreamina CLI's raw `fail_reason` to a user-friendly Chinese message.
 * Dreamina's server-side upload-token call flakes intermittently (EOF mid
 * POST), and by the time the CLI surfaces the error the user just sees
 * `get upload token: Post ... : EOF` which reads like a bug. These patterns
 * turn the few common transient failures into actionable hints.
 */
function humanizeDreaminaFailReason(reason: string | undefined | null): string {
  if (!reason) return '即梦服务端任务失败，原因未知';
  const r = reason.toLowerCase();
  // Submit-step network flakes: the CLI posts to various dreamina endpoints
  // (image_generate, upload-token, etc.) and any of them can return `EOF`
  // mid-request during backend hiccups OR when the client network rewrites /
  // blocks jianying.com traffic at the TLS layer.
  if (r.includes('eof') && (
    r.includes('upload token') ||
    r.includes('do request') ||
    r.includes('image_generate') ||
    r.includes('post ')
  )) {
    return '到即梦服务器的 TLS 握手被切断（已自动重试仍失败）。\n常见原因：本机网络/VPN/防火墙对 jianying.com 做了拦截。\n请打开「设置 → Dreamina 即梦」，点「网络体检」按钮定位具体被卡在哪一层，或尝试切到 4G/5G 热点重试。';
  }
  if (r.includes('context deadline exceeded')) {
    return '即梦任务超时未返回，请稍后重试';
  }
  if (r.includes('credit') || r.includes('积分')) {
    return '即梦积分不足或账号限流';
  }
  if (r.includes('unauthor') || r.includes('未登录') || r.includes('token expired')) {
    return '即梦登录已过期，请在设置中重新登录 CLI';
  }
  return `即梦服务端返回失败：${reason.slice(0, 200)}`;
}

/** Parse the first usable image/video URL / local path from the CLI's combined output. */
function extractResultUrl(raw: string, media: 'image' | 'video' = 'image'): string | null {
  const ext = media === 'video'
    ? '(?:mp4|mov|webm|m4v)'
    : '(?:png|jpg|jpeg|webp)';
  // Common output shapes from dreamina CLI include:
  //  - "image_url: https://.../foo.png"
  //  - "video_url: https://.../foo.mp4"
  //  - JSON blobs with "image_url" / "url" / "local_path" fields
  //  - "downloaded to /Users/.../result-*.png"
  const patterns = [
    media === 'video' ? /"video_url"\s*:\s*"([^"]+)"/ : /"image_url"\s*:\s*"([^"]+)"/,
    new RegExp(`"url"\\s*:\\s*"(https?:\\/\\/[^"]+\\.${ext})"`, 'i'),
    /"local_path"\s*:\s*"([^"]+)"/,
    media === 'video' ? /video_url[=:]\s*(\S+)/ : /image_url[=:]\s*(\S+)/,
    new RegExp(`downloaded\\s+to\\s+(\\S+\\.${ext})`, 'i'),
    new RegExp(`(https?:\\/\\/\\S+\\.${ext})`, 'i'),
  ];
  for (const p of patterns) {
    const m = raw.match(p);
    if (m) return m[1];
  }
  return null;
}

/** If the CLI returned an absolute local path (POSIX or Windows), rewrap it as
 *  a Tauri `asset://localhost/...` URL so the webview can render it via
 *  <img src=>. Remote URLs pass through. */
function rewrapLocalPath(url: string): string {
  const looksLocal = url.startsWith('/') || /^[A-Za-z]:[\\/]/.test(url);
  if (!looksLocal) return url;
  try {
    return convertFileSrc(url);
  } catch {
    return url;
  }
}

/** Backup submit_id extractor for stdout blocks that didn't make it into the
 *  Rust-side `backend.submitId` (e.g. the field name varied or the poll
 *  output wrapped it differently). */
function extractSubmitIdFallback(raw: string): string | null {
  const m = raw.match(/"submit_id"\s*:\s*"([a-f0-9]+)"/i) ?? raw.match(/submit_id[=:]\s*([a-f0-9]{8,})/i);
  return m ? m[1] : null;
}

/**
 * Map the user's ratio selection to a Dreamina ratio the CLI accepts.
 * The CLI does NOT have a literal "auto" — we treat it as omit-ratio (so
 * the model uses its default).
 */
function normalizeRatio(r: string | undefined): string | undefined {
  if (!r) return undefined;
  if (r === 'auto') return undefined;
  const allowed = ['21:9', '16:9', '3:2', '4:3', '1:1', '3:4', '2:3', '9:16'];
  return allowed.includes(r) ? r : undefined;
}

function normalizeVideoRatio(r: string | undefined): string | undefined {
  if (!r || r === 'auto') return undefined;
  const allowed = ['1:1', '3:4', '16:9', '4:3', '9:16', '21:9'];
  return allowed.includes(r) ? r : undefined;
}

function inferExtensionFromDataUrl(dataUrl: string, fallback: string): string {
  const match = dataUrl.match(/^data:([^;,]+)[;,]/i);
  const mime = match?.[1]?.toLowerCase() ?? '';
  if (mime.includes('mp4')) return 'mp4';
  if (mime.includes('quicktime')) return 'mov';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('aac')) return 'aac';
  return fallback;
}

async function stashDataUrlToMediaFile(dataUrl: string, fallbackExtension: string): Promise<string> {
  return await invoke<string>('dreamina_stage_reference_media', {
    dataUrl,
    extension: inferExtensionFromDataUrl(dataUrl, fallbackExtension),
  });
}

async function stageVideoReference(src: string): Promise<string> {
  if (src.startsWith('data:')) return await stashDataUrlToMediaFile(src, 'mp4');
  return await persistVideoSource(src);
}

async function stageAudioReference(src: string): Promise<string> {
  const dataUrl = src.startsWith('data:') ? src : await loadAudioSourceDataUrl(src);
  return await stashDataUrlToMediaFile(dataUrl, 'mp3');
}

async function pollDreaminaResult(
  jobId: string,
  submitId: string,
  media: 'image' | 'video',
  timeoutMs: number,
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    const queried = await invoke<DreaminaBackendResult>('dreamina_query_result', {
      submitId,
      downloadDir: undefined,
    });
    const combined = `${queried.stdout}\n${queried.stderr}`;
    if (!queried.ok) {
      const lower = (queried.error ?? combined).toLowerCase();
      const transient = lower.includes('running') || lower.includes('pending') || lower.includes('processing') || lower.includes('not finished');
      if (transient) continue;
    }
    const resultUrl = extractResultUrl(combined, media);
    if (resultUrl) return resultUrl;
    if (!queried.ok && queried.error) {
      resultCache.set(jobId, {
        job_id: jobId,
        status: 'failed',
        result: null,
        error: humanizeDreaminaFailReason(queried.error),
      });
      return null;
    }
  }
  return null;
}

/**
 * Invoke a Dreamina submit command with one automatic retry on transient
 * network-style failures (EOF mid-POST, "do request" errors). The upstream
 * `jimeng.jianying.com` endpoint sporadically drops the connection during
 * the submit phase — a single retry 3s later resolves most of these without
 * bothering the user.
 */
async function invokeDreaminaSubmitWithRetry(
  command: string,
  args: Record<string, unknown>,
): Promise<DreaminaBackendResult> {
  const first = await invoke<DreaminaBackendResult>(command, args);
  if (first.ok) return first;
  const err = (first.error ?? '').toLowerCase();
  const isTransient = err.includes('eof') || err.includes('do request') || err.includes('i/o timeout');
  if (!isTransient) return first;
  await new Promise((r) => setTimeout(r, 3000));
  const second = await invoke<DreaminaBackendResult>(command, args);
  return second;
}

/**
 * Submit a Dreamina generation job. `request.model` looks like `dreamina:text2image`
 * / `dreamina:image2image`. Returns a synthetic job id whose result is cached
 * in `resultCache` for later retrieval.
 */
export async function submitDreaminaJob(request: GenerateRequest): Promise<string> {
  // Request.model shape is either `dreamina:<version>` (e.g. `dreamina:5.0`)
  // or the legacy `dreamina:<sub>` form (`dreamina:text2image` / `:image2image`
  // / `:image_upscale`). New UI passes model versions directly; the sub is
  // now inferred from whether reference images are provided:
  //   - no refs → text2image
  //   - has refs → image2image
  //   - model id === 'upscale' / 'image_upscale' → image_upscale
  const modelPart = request.model.split(':')[1] ?? '5.0';
  const refs = request.reference_images ?? [];
  const isUpscale = modelPart === 'upscale' || modelPart === 'image_upscale';
  // Legacy sub-command selectors still recognised for back-compat. Otherwise
  // the `modelPart` is treated as a dreamina model_version.
  const LEGACY_SUBS = new Set(['text2image', 'image2image']);
  const legacySub = LEGACY_SUBS.has(modelPart) ? modelPart : null;
  const effectiveSub: 'text2image' | 'image2image' | 'image_upscale' = isUpscale
    ? 'image_upscale'
    : legacySub
      ? (legacySub as 'text2image' | 'image2image')
      : refs.length > 0 ? 'image2image' : 'text2image';
  const effectiveVersion = (isUpscale || legacySub) ? undefined : modelPart;

  const jobId = `dreamina-local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  resultCache.set(jobId, { job_id: jobId, status: 'running', result: null, error: null });

  try {
    let backend: DreaminaBackendResult;
    if (effectiveSub === 'image2image') {
      const paths: string[] = [];
      for (let i = 0; i < refs.length; i++) {
        paths.push(await stashRemoteOrDataUrlToTempFile(refs[i], i));
      }
      backend = await invokeDreaminaSubmitWithRetry('dreamina_image2image', {
        prompt: request.prompt,
        imagePaths: paths,
        ratio: normalizeRatio(request.aspect_ratio),
        resolutionType: (request.extra_params as { resolutionType?: string })?.resolutionType,
        modelVersion: effectiveVersion ?? (request.extra_params as { modelVersion?: string })?.modelVersion,
        pollSeconds: 120,
      });
    } else if (effectiveSub === 'image_upscale') {
      if (refs.length === 0) {
        resultCache.set(jobId, {
          job_id: jobId,
          status: 'failed',
          result: null,
          error: '即梦高清放大需要一张输入图',
        });
        return jobId;
      }
      const path = await stashRemoteOrDataUrlToTempFile(refs[0], 0);
      backend = await invokeDreaminaSubmitWithRetry('dreamina_image_upscale', {
        imagePath: path,
        resolutionType: (request.extra_params as { resolutionType?: string })?.resolutionType ?? '2k',
        pollSeconds: 120,
      });
    } else {
      backend = await invokeDreaminaSubmitWithRetry('dreamina_text2image', {
        prompt: request.prompt,
        ratio: normalizeRatio(request.aspect_ratio),
        resolutionType: (request.extra_params as { resolutionType?: string })?.resolutionType,
        modelVersion: effectiveVersion ?? (request.extra_params as { modelVersion?: string })?.modelVersion,
        pollSeconds: 60,
      });
    }

    if (!backend.ok) {
      resultCache.set(jobId, { job_id: jobId, status: 'failed', result: null, error: humanizeDreaminaFailReason(backend.error ?? '即梦 CLI 执行失败') });
      return jobId;
    }
    // Fast path: if the submit already printed a URL or local path, use it.
    let resultUrl = extractResultUrl(backend.stdout, 'image') ?? extractResultUrl(backend.stderr, 'image');
    const submitId = backend.submitId ?? extractSubmitIdFallback(backend.stdout + backend.stderr);

    // Slow path: the CLI's submit step frequently returns only a submit_id
    // (the async task is still running server-side, or —- in the user's EOF
    // case —- failed after submit). Poll `list_task` every 3s for up to 5 min
    // to pick up the final status + image_urls / fail_reason.
    if (!resultUrl && submitId) {
      const deadline = Date.now() + 5 * 60 * 1000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 3000));
        const list = await invoke<DreaminaBackendResult>('dreamina_list_task');
        if (!list.ok) continue; // transient CLI / network hiccup; try again
        try {
          const entries = JSON.parse(list.stdout) as Array<{
            submit_id: string;
            gen_status: 'done' | 'fail' | 'running' | 'pending' | string;
            fail_reason?: string;
            image_urls?: string[];
            local_paths?: string[];
          }>;
          const match = entries.find((e) => e.submit_id === submitId);
          if (!match) continue; // submit_id not yet in list (brand-new submit)
          if (match.gen_status === 'fail') {
            resultCache.set(jobId, {
              job_id: jobId,
              status: 'failed',
              result: null,
              error: humanizeDreaminaFailReason(match.fail_reason),
            });
            return jobId;
          }
          if (match.gen_status === 'done') {
            const u = match.image_urls?.[0] ?? match.local_paths?.[0];
            if (u) { resultUrl = u; break; }
          }
          // else pending / running → keep polling
        } catch {
          // list_task output wasn't JSON (network failure); keep polling
        }
      }
    }

    if (!resultUrl) {
      resultCache.set(jobId, {
        job_id: jobId,
        status: 'failed',
        result: null,
        error: '即梦任务超过 5 分钟未返回结果，请稍后在设置中检查登录状态或查看 CLI 日志。',
      });
      return jobId;
    }
    const wrappedUrl = rewrapLocalPath(resultUrl);
    resultCache.set(jobId, { job_id: jobId, status: 'succeeded', result: wrappedUrl, error: null });
    return jobId;
  } catch (err) {
    resultCache.set(jobId, {
      job_id: jobId,
      status: 'failed',
      result: null,
      error: err instanceof Error ? err.message : String(err),
    });
    return jobId;
  }
}

export function getDreaminaJob(jobId: string): GenerationJobStatus {
  const cached = resultCache.get(jobId);
  if (!cached) return { job_id: jobId, status: 'not_found', result: null, error: 'job id not found' };
  return cached;
}

export async function submitDreaminaVideoJob(payload: GenerateVideoPayload): Promise<string> {
  const modelPart = payload.model.split(':')[1] ?? 'text-video';
  const refs = payload.referenceImages ?? [];
  const referenceVideos = payload.referenceVideos ?? [];
  const referenceAudios = payload.referenceAudios ?? [];
  const extra = payload.extraParams ?? {};
  const duration = typeof payload.seconds === 'number' && Number.isFinite(payload.seconds)
    ? Math.round(payload.seconds)
    : undefined;
  const resolution = payload.size && payload.size !== 'auto'
    ? payload.size
    : (typeof extra.videoResolution === 'string' ? extra.videoResolution : undefined);
  const modelVersion = typeof extra.modelVersion === 'string' ? extra.modelVersion : undefined;
  const ratio = normalizeVideoRatio(payload.aspectRatio);
  const jobId = `dreamina-video-local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  resultCache.set(jobId, { job_id: jobId, status: 'running', result: null, error: null });

  try {
    let backend: DreaminaBackendResult;
    if (modelPart === 'image-video') {
      if (refs.length < 1) {
        resultCache.set(jobId, { job_id: jobId, status: 'failed', result: null, error: '图生视频需要 1 张首帧图片' });
        return jobId;
      }
      const imagePath = await stashRemoteOrDataUrlToTempFile(refs[0], 0);
      backend = await invokeDreaminaSubmitWithRetry('dreamina_image2video', {
        prompt: payload.prompt,
        imagePath,
        modelVersion,
        duration,
        videoResolution: resolution,
        pollSeconds: 180,
      });
    } else if (modelPart === 'frames-video') {
      if (refs.length < 2) {
        resultCache.set(jobId, { job_id: jobId, status: 'failed', result: null, error: '首尾帧成片需要 2 张图片' });
        return jobId;
      }
      const firstPath = await stashRemoteOrDataUrlToTempFile(refs[0], 0);
      const lastPath = await stashRemoteOrDataUrlToTempFile(refs[1], 1);
      backend = await invokeDreaminaSubmitWithRetry('dreamina_frames2video', {
        prompt: payload.prompt,
        firstPath,
        lastPath,
        modelVersion,
        duration,
        videoResolution: resolution,
        pollSeconds: 180,
      });
    } else if (modelPart === 'multi-frame-video') {
      if (refs.length < 2) {
        resultCache.set(jobId, { job_id: jobId, status: 'failed', result: null, error: '多帧成片至少需要 2 张图片' });
        return jobId;
      }
      const imagePaths: string[] = [];
      for (let i = 0; i < refs.length; i++) {
        imagePaths.push(await stashRemoteOrDataUrlToTempFile(refs[i], i));
      }
      const transitionCount = Math.max(0, imagePaths.length - 1);
      const segmentDuration = typeof payload.seconds === 'number' && transitionCount > 0
        ? Math.max(0.5, Math.min(8, payload.seconds / transitionCount))
        : undefined;
      backend = await invokeDreaminaSubmitWithRetry('dreamina_multiframe2video', {
        imagePaths,
        prompt: payload.prompt,
        duration: segmentDuration,
        transitionPrompts: imagePaths.length > 2
          ? Array.from({ length: transitionCount }, () => payload.prompt)
          : undefined,
        transitionDurations: imagePaths.length > 2 && segmentDuration
          ? Array.from({ length: transitionCount }, () => String(segmentDuration))
          : undefined,
        pollSeconds: 240,
      });
    } else if (modelPart === 'all-reference-video') {
      const imagePaths: string[] = [];
      for (let i = 0; i < refs.length; i++) {
        imagePaths.push(await stashRemoteOrDataUrlToTempFile(refs[i], i));
      }
      const videoPaths: string[] = [];
      for (const src of referenceVideos.slice(0, 3)) {
        videoPaths.push(await stageVideoReference(src));
      }
      const audioPaths: string[] = [];
      for (const src of referenceAudios.slice(0, 3)) {
        audioPaths.push(await stageAudioReference(src));
      }
      backend = await invokeDreaminaSubmitWithRetry('dreamina_multimodal2video', {
        prompt: payload.prompt,
        imagePaths,
        videoPaths,
        audioPaths,
        modelVersion,
        ratio,
        duration,
        videoResolution: resolution,
        pollSeconds: 240,
      });
    } else {
      backend = await invokeDreaminaSubmitWithRetry('dreamina_text2video', {
        prompt: payload.prompt,
        modelVersion,
        ratio,
        duration,
        videoResolution: resolution,
        pollSeconds: 180,
      });
    }

    if (!backend.ok) {
      resultCache.set(jobId, { job_id: jobId, status: 'failed', result: null, error: humanizeDreaminaFailReason(backend.error ?? '即梦 CLI 执行失败') });
      return jobId;
    }

    const combined = `${backend.stdout}\n${backend.stderr}`;
    let resultUrl = extractResultUrl(combined, 'video');
    const submitId = backend.submitId ?? extractSubmitIdFallback(combined);
    if (!resultUrl && submitId) {
      resultUrl = await pollDreaminaResult(jobId, submitId, 'video', 8 * 60 * 1000);
    }
    if (!resultUrl) {
      resultCache.set(jobId, {
        job_id: jobId,
        status: 'failed',
        result: null,
        error: '即梦视频任务超过 8 分钟未返回结果，请稍后在设置中检查登录状态或查看 CLI 日志。',
      });
      return jobId;
    }
    resultCache.set(jobId, { job_id: jobId, status: 'succeeded', result: rewrapLocalPath(resultUrl), error: null });
    return jobId;
  } catch (err) {
    resultCache.set(jobId, {
      job_id: jobId,
      status: 'failed',
      result: null,
      error: err instanceof Error ? err.message : String(err),
    });
    return jobId;
  }
}
