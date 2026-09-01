// @env node

import { spawn } from 'node:child_process';

import { checkAurisConfiguration } from '@ciels/asr';

import type { ConfigurationIssue, ConfigurationStatus } from '../shared/types.ts';

const EXECUTABLE_TIMEOUT_MS = 5_000;

export async function checkRuntimeConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<ConfigurationStatus> {
  const issues: ConfigurationIssue[] = [];
  required(issues, environment.AI_API_KEY, 'AI_API_KEY', '缺少 AI API Key');
  required(issues, environment.AI_MODEL, 'AI_MODEL', '缺少 AI 模型名称');
  checkBaseUrl(issues, environment.AI_BASE_URL);

  const asr = await checkAurisConfiguration();
  if (!asr.valid) {
    issues.push({
      key: 'CIEL_DATA_DIR',
      message: `ASR 模型不完整，缺少 ${asr.missingFiles.length} 个文件。运行 vp run asr:install 安装模型`,
      detail: asr.missingFiles.join('\n'),
    });
  }

  const [node, ffmpeg] = await Promise.all([
    checkExecutable(environment.CIEL_NODE_EXECUTABLE?.trim() || 'node', ['--version']),
    checkExecutable(environment.FFMPEG_PATH?.trim() || 'ffmpeg', ['-version']),
  ]);
  if (node) issues.push({ key: 'CIEL_NODE_EXECUTABLE', message: node });
  if (ffmpeg) issues.push({ key: 'FFMPEG_PATH', message: ffmpeg });

  return {
    checkedAt: Date.now(),
    dataPath: asr.dataPath,
    issues,
    valid: issues.length === 0,
  };
}

export function configurationError(status: ConfigurationStatus): Error {
  return new Error(`配置检查未通过：${status.issues.map(issue => issue.message).join('；')}`);
}

function required(
  issues: ConfigurationIssue[],
  value: string | undefined,
  key: string,
  message: string,
): void {
  if (!value?.trim()) issues.push({ key, message });
}

function checkBaseUrl(issues: ConfigurationIssue[], value: string | undefined): void {
  const normalized = value?.trim() || 'https://openrouter.ai/api/v1';
  try {
    const url = new URL(normalized);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('unsupported');
  } catch {
    issues.push({ key: 'AI_BASE_URL', message: 'AI_BASE_URL 必须是有效的 HTTP(S) 地址' });
  }
}

function checkExecutable(command: string, args: readonly string[]): Promise<string | undefined> {
  return new Promise(resolve => {
    const child = spawn(command, args, { stdio: 'ignore', windowsHide: true });
    let settled = false;
    const finish = (message?: string): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(message);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(`无法在 ${EXECUTABLE_TIMEOUT_MS / 1_000} 秒内运行 ${command}`);
    }, EXECUTABLE_TIMEOUT_MS);
    child.once('error', error => finish(`无法运行 ${command}：${error.message}`));
    child.once('exit', code =>
      finish(code === 0 ? undefined : `${command} 配置检查退出，代码 ${String(code)}`),
    );
  });
}
