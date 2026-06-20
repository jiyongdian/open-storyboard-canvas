import { memo, useCallback, useState } from 'react';
import { Terminal, Copy, CheckCircle2, RefreshCw, AlertCircle, ExternalLink, Activity, Loader2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

import { useSettingsStore } from '@/stores/settingsStore';

interface DreaminaStatus {
  kind: 'unknown' | 'not-installed' | 'not-logged-in' | 'logged-in' | 'logged-in-degraded' | 'error';
  message?: string;
  credits?: number;
  resolvedPath?: string;
}

interface BackendStatus {
  installed: boolean;
  loggedIn: boolean;
  credits: number | null;
  error: string | null;
  networkDegraded: boolean;
  resolvedPath: string | null;
}

interface NetworkStage {
  ok: boolean;
  detail: string;
}
interface NetworkDiagnoseResult {
  dns: NetworkStage;
  tcp: NetworkStage;
  tls: NetworkStage;
  http: NetworkStage;
  overallAdvice: string;
}

/**
 * Dreamina (即梦) section of the settings dialog.
 *
 * We do NOT ask users to paste credentials here — Dreamina uses an installed
 * CLI (`dreamina`) with a local login session. This section only needs to:
 *   1) Tell the user how to install + log in,
 *   2) Provide a one-click "check login" button that runs `dreamina user_credit`,
 *   3) Show current status / remaining credits.
 * The actual image2image / text2image calls use the same CLI under the hood.
 */
export const DreaminaSection = memo(() => {
  const [status, setStatus] = useState<DreaminaStatus>({ kind: 'unknown' });
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnose, setDiagnose] = useState<NetworkDiagnoseResult | null>(null);

  const handleDiagnose = useCallback(async () => {
    setDiagnosing(true);
    setDiagnose(null);
    try {
      const res = await invoke<NetworkDiagnoseResult>('dreamina_network_diagnose');
      setDiagnose(res);
    } catch (err) {
      setDiagnose({
        dns: { ok: false, detail: '诊断命令调用失败' },
        tcp: { ok: false, detail: '' },
        tls: { ok: false, detail: '' },
        http: { ok: false, detail: '' },
        overallAdvice: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setDiagnosing(false);
    }
  }, []);

  const runCli = useCallback(async (): Promise<BackendStatus> => {
    try {
      return await invoke<BackendStatus>('check_dreamina_login');
    } catch (err) {
      return { installed: false, loggedIn: false, credits: null, error: err instanceof Error ? err.message : String(err), networkDegraded: false, resolvedPath: null };
    }
  }, []);

  const handleCheck = useCallback(async () => {
    setChecking(true);
    try {
      const res = await runCli();
      // Mirror the result into settingsStore so the rest of the app (model
      // catalog, panel pickers) can see Dreamina availability without
      // re-invoking the CLI.
      useSettingsStore.getState().setDreaminaStatus({
        loggedIn: res.loggedIn,
        credits: res.credits,
        networkDegraded: res.networkDegraded,
      });
      if (!res.installed) {
        setStatus({ kind: 'not-installed', message: res.error ?? '未检测到 dreamina CLI,请按下方步骤安装。' });
        return;
      }
      if (!res.loggedIn) {
        setStatus({
          kind: 'not-logged-in',
          message: res.error ?? 'CLI 已安装但未登录，执行 `dreamina login` 完成登录。',
          resolvedPath: res.resolvedPath ?? undefined,
        });
        return;
      }
      setStatus({
        kind: res.networkDegraded ? 'logged-in-degraded' : 'logged-in',
        credits: res.credits ?? undefined,
        message: res.networkDegraded ? (res.error ?? '已登录，但积分接口暂不可达（网络波动）') : undefined,
        resolvedPath: res.resolvedPath ?? undefined,
      });
    } finally {
      setChecking(false);
    }
  }, [runCli]);

  const copyToClipboard = useCallback(async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    } catch { /* ignore */ }
  }, []);

  const statusColor = status.kind === 'logged-in'
    ? 'emerald'
    : status.kind === 'logged-in-degraded'
      ? 'amber-green'
      : status.kind === 'not-installed' || status.kind === 'not-logged-in'
        ? 'amber'
        : status.kind === 'error' ? 'red' : 'white';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-text-dark">Dreamina 即梦</h2>
        <p className="mt-1 text-xs text-text-muted">
          即梦不需要贴 API Key。它通过本地安装的 <code className="rounded bg-bg-dark px-1">dreamina</code> CLI 登录后使用；检测到已登录且账号可用后，画布会自动解锁即梦图片和视频生成能力。
        </p>
      </div>

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.08] p-3">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
          <div className="space-y-1">
            <div className="text-sm font-medium text-amber-100">官方 CLI 会员限制提醒</div>
            <p className="text-xs leading-5 text-amber-100/75">
              即梦官方目前会按账号权益限制 CLI 图片 / 视频能力。登录检测正常只代表本机 CLI 和登录态可用；如果账号没有对应权益，提交任务仍可能被官方拒绝。非会员或受限账号建议优先使用「我的配置」里的自定义服务商。
            </p>
          </div>
        </div>
      </div>

      {/* Current status card */}
      <div className={`rounded-lg border p-4 ${
        statusColor === 'emerald' ? 'border-emerald-500/30 bg-emerald-500/5' :
        statusColor === 'amber-green' ? 'border-emerald-500/30 bg-emerald-500/5' :
        statusColor === 'amber' ? 'border-amber-500/30 bg-amber-500/5' :
        statusColor === 'red' ? 'border-red-500/30 bg-red-500/5' :
        'border-border-dark bg-bg-dark'
      }`}>
        <div className="flex items-start gap-3">
          {status.kind === 'logged-in' ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
          ) : status.kind === 'logged-in-degraded' ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
          ) : status.kind === 'unknown' ? (
            <Terminal className="mt-0.5 h-5 w-5 shrink-0 text-text-muted" />
          ) : (
            <AlertCircle className={`mt-0.5 h-5 w-5 shrink-0 ${statusColor === 'amber' ? 'text-amber-400' : 'text-red-400'}`} />
          )}
          <div className="flex-1">
            <div className="text-sm font-medium text-text-dark">
              {status.kind === 'unknown' && '点击下方按钮检测 CLI 安装与登录状态'}
              {status.kind === 'not-installed' && '未检测到 dreamina CLI'}
              {status.kind === 'not-logged-in' && 'CLI 已安装 · 未登录'}
              {status.kind === 'logged-in' && `CLI 登录正常 · 剩余积分 ${status.credits ?? '?'}`}
              {status.kind === 'logged-in-degraded' && (
                <span className="inline-flex items-center gap-2">
                  已登录
                  <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-normal text-amber-300">网络不稳定</span>
                </span>
              )}
              {status.kind === 'error' && 'CLI 检测出错'}
            </div>
            {status.message && <div className="mt-1 text-xs text-text-muted">{status.message}</div>}
            {status.resolvedPath && (
              <div className="mt-1 text-[10px] text-text-muted/60 font-mono truncate" title={status.resolvedPath}>
                二进制：{status.resolvedPath}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={handleCheck}
            disabled={checking}
            className="inline-flex items-center gap-1 rounded-md bg-accent/20 px-3 py-1.5 text-xs text-accent hover:bg-accent/30 disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${checking ? 'animate-spin' : ''}`} />
            {checking ? '检测中...' : '检测登录'}
          </button>
          <button
            type="button"
            onClick={handleDiagnose}
            disabled={diagnosing}
            className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-text-dark hover:bg-white/10 disabled:opacity-50"
            title="DNS → TCP → TLS → HTTP 逐层测试到 jimeng.jianying.com"
          >
            {diagnosing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Activity className="h-3 w-3" />}
            {diagnosing ? '诊断中...' : '网络体检'}
          </button>
        </div>
      </div>

      {/* Network diagnose result */}
      {diagnose && (
        <div className="rounded-lg border border-border-dark bg-bg-dark p-4">
          <div className="text-sm font-medium text-text-dark mb-2">网络体检结果</div>
          <div className="grid grid-cols-[80px_1fr] gap-x-3 gap-y-1.5 text-[11px]">
            {[
              { key: 'DNS', stage: diagnose.dns },
              { key: 'TCP', stage: diagnose.tcp },
              { key: 'TLS', stage: diagnose.tls },
              { key: 'HTTP', stage: diagnose.http },
            ].map(({ key, stage }) => (
              <div key={key} className="contents">
                <div className="flex items-center gap-1.5 text-text-muted">
                  <span className={`inline-block h-2 w-2 rounded-full ${stage.ok ? 'bg-emerald-400' : 'bg-red-400'}`} />
                  {key}
                </div>
                <div className={`break-all ${stage.ok ? 'text-text-dark' : 'text-red-300/90'}`}>{stage.detail || '—'}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-md border border-white/10 bg-surface-dark/60 p-2.5 text-[11px] text-text-muted leading-5 whitespace-pre-wrap">
            {diagnose.overallAdvice}
          </div>
        </div>
      )}

      {/* Install guide */}
      <div className="rounded-lg border border-border-dark bg-bg-dark p-4">
        <div className="text-sm font-medium text-text-dark">① 安装 CLI</div>
        <p className="mt-1 text-[11px] text-text-muted">
          macOS / Linux 一行命令安装（Windows 用户建议走 WSL）。如果已经装过可跳过这步。
        </p>
        <div className="mt-2 flex items-center gap-2">
          <code className="flex-1 overflow-x-auto rounded-md bg-surface-dark px-3 py-2 text-[11px] text-text-dark font-mono">
            curl -fsSL https://dreamina.jianying.com/install.sh | bash
          </code>
          <button
            type="button"
            onClick={() => copyToClipboard('curl -fsSL https://dreamina.jianying.com/install.sh | bash', 'install')}
            className="shrink-0 inline-flex items-center gap-1 rounded-md bg-white/5 px-2 py-1.5 text-[11px] text-text-muted hover:bg-white/10"
          >
            {copied === 'install' ? <CheckCircle2 className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          </button>
        </div>
        <div className="mt-2 text-[11px] text-text-muted/70">
          ⓘ 如上述一键脚本失败，可前往 <a href="https://dreamina.jianying.com/platform/cli" target="_blank" rel="noopener" className="inline-flex items-center gap-0.5 text-accent hover:underline">即梦 CLI 官方页<ExternalLink className="h-3 w-3" /></a> 手动下载二进制。
        </div>
      </div>

      {/* Login guide */}
      <div className="rounded-lg border border-border-dark bg-bg-dark p-4">
        <div className="text-sm font-medium text-text-dark">② 登录账号</div>
        <p className="mt-1 text-[11px] text-text-muted">
          执行 <code className="rounded bg-surface-dark px-1">dreamina login</code> 会弹出浏览器完成登录，登录信息保存在本地。
        </p>
        <div className="mt-2 flex items-center gap-2">
          <code className="flex-1 rounded-md bg-surface-dark px-3 py-2 text-[11px] text-text-dark font-mono">
            dreamina login
          </code>
          <button
            type="button"
            onClick={() => copyToClipboard('dreamina login', 'login')}
            className="shrink-0 inline-flex items-center gap-1 rounded-md bg-white/5 px-2 py-1.5 text-[11px] text-text-muted hover:bg-white/10"
          >
            {copied === 'login' ? <CheckCircle2 className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          </button>
        </div>
        <p className="mt-2 text-[11px] text-text-muted/70">登录后回到这里点「检测登录」。</p>
      </div>

      {/* Built-in models */}
      <div className="rounded-lg border border-border-dark bg-bg-dark p-4">
        <div className="text-sm font-medium text-text-dark">③ 画布可用能力</div>
        <p className="mt-1 text-[11px] text-text-muted">
          即梦 CLI 登录成功后，本应用会自动提供以下官方能力，生成节点中直接选用即可；能力名称用中文展示，模型原名保留。
        </p>
        <ul className="mt-2 space-y-1 text-[11px] text-text-muted list-disc pl-4">
          <li>图片：文生图支持 3.0 / 3.1 / 4.0 / 4.1 / 4.5 / 4.6 / 4.7 / 5.0；3.x 可选 1k / 2k，4.0+ 可选 2k / 4k。</li>
          <li>图片：图生图支持 4.0 / 4.1 / 4.5 / 4.6 / 4.7 / 5.0，最多 10 张参考图，可选 2k / 4k。</li>
          <li>图片：高清放大需要 1 张图，可选 2k / 4k / 8k，其中 4k / 8k 通常需要 VIP 权益。</li>
          <li>视频：文生视频支持 Seedance 2.0 系列和 mini，时长 4-15 秒，普通模型 720p，seedance2.0_vip 可选 1080p。</li>
          <li>视频：图生视频需要 1 张首帧图；首尾帧成片需要 2 张图；多帧成片支持 2-20 张图。</li>
          <li>视频：全能参考成片支持图片最多 9 张、视频最多 3 个、音频最多 3 个；音频参考需约 2-15 秒。</li>
        </ul>
        <div className="mt-3 rounded-md border border-white/10 bg-surface-dark/60 p-2.5 text-[11px] leading-5 text-text-muted">
          参数入口在画布节点的「参数」里。图片分辨率按 1k / 2k / 4k / 8k 展示；视频分辨率按 720p / 1080p 展示。图生视频、首尾帧和多帧成片的比例由参考图推断，因此画布中显示为「智能」。
        </div>
      </div>
    </div>
  );
});

DreaminaSection.displayName = 'DreaminaSection';
