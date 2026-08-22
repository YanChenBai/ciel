import { fileURLToPath } from 'node:url';

process.env.CIEL_DATA_DIR ??= fileURLToPath(new URL('../../../.ciel-data/', import.meta.url));

const [{ Ciel, Memory, definePrompt }, { createBridge }, { createBliveAI }, { BilibiliLive }] =
  await Promise.all([
    import('@ciels/core'),
    import('@ciels/vigilia-bridge'),
    import('./ai.ts'),
    import('./blive.ts'),
  ]);

const roomId = 6374209;
const defaultImageInterval = 60_000 / 9;
const imageInterval = readOptionalPositiveNumber(process.env.BLIVE_IMAGE_INTERVAL);
const live = new BilibiliLive({
  roomId,
  ...(process.env.BLIVE_FFMPEG_PATH ? { ffmpegPath: process.env.BLIVE_FFMPEG_PATH } : {}),
  ...(imageInterval === undefined ? {} : { imageInterval }),
});
const { embedder, model } = createBliveAI();
const memory = new Memory({
  path: fileURLToPath(new URL('../../../.ciel-data/memory.db', import.meta.url)),
  embedder,
  model,
  resourceId: `blive:${roomId}`,
});
const ciel = new Ciel(live, {
  vigilia: {
    capture: {
      context: true,
      memory: true,
      reasoning: true,
      result: true,
      toolInput: true,
      toolOutput: true,
    },
    // 原始音频/视频 signal 很密集；ASR、视觉处理和 Percept 仍会独立观察。
    signals: false,
  },
  nucleus: {
    model,
    memory,
    context: {
      maxImages: 9,
      perceptWindow: 60_000,
    },
    minThinkInterval: 10_000,
    maxThinkInterval: 60_000,
    system: [
      definePrompt(`
      你正在观察一个 Bilibili 直播间。
      结合 Hearing、Sight、近期情景与长期记忆理解正在发生的事情。
      只描述有依据的内容，区分事实与推测；没有值得表达的新信息时保持简短。
      你需要和主播互动，需要返回像发送的弹幕。
      `),
    ],
  },
  oculus: {
    // FFmpeg 已按 imageInterval 限流，Oculus 接收每一张输出帧即可。
    sampleInterval: 0,
    differenceThreshold: 0.03,
  },
});
const bridgePort = readOptionalPositiveNumber(process.env.CIEL_BRIDGE_PORT) ?? 3000;
const bridge = createBridge(ciel);
bridge.listen(bridgePort);

let hearings = 0;
let sights = 0;
let shuttingDown = false;
let cielStarted = false;
let resolveClosed: (() => void) | undefined;
const closed = new Promise<void>(resolve => {
  resolveClosed = resolve;
});

ciel.on('data', percept => {
  if (percept.type === 'hearing') {
    hearings += 1;
    console.log(`[hearing] ${percept.speaker ? `[${percept.speaker}] ` : ''}${percept.content}`);
  } else if (percept.type === 'sight') {
    sights += 1;
    console.log(`[sight] ${percept.path}`);
  }
});
ciel.on('error', error => {
  console.error(`[ciel] ${formatCielError(error)}`);
});
ciel.on('thought', output => {
  console.log(`[thought] ${String(output)}`);
});

live.onError(error => {
  console.error(`[blive] ${error.stack ?? error.message}`);
});
live.onStderr(message => {
  console.error(`[ffmpeg] ${message}`);
});
live.onClose((code, signal) => {
  if (!shuttingDown) {
    if (code !== 0) {
      console.error(`[blive] FFmpeg 意外退出（code=${String(code)}, signal=${String(signal)}）`);
      process.exitCode = 1;
    }
    void shutdown('SIGTERM');
    return;
  }
  resolveClosed?.();
});

const report = setInterval(() => {
  const health = live.getHealth();
  console.log(
    `[blive] audio=${(health.audioBytes / 1024 / 1024).toFixed(2)} MiB photons=${health.imageFrames} hearings=${hearings} sights=${sights}`,
  );
}, 30_000);

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[blive] 收到 ${signal}，正在关闭 Ciel…`);
  clearInterval(report);
  if (cielStarted) {
    await ciel.stop();
    cielStarted = false;
  }
  await bridge.stop();
  resolveClosed?.();
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

try {
  console.log(`[blive] 正在通过 Ciel 连接 Bilibili 直播间 ${roomId}…`);
  console.log(`[vigilia] 可观测 Bridge 已监听 http://localhost:${bridgePort}`);
  await ciel.start();
  cielStarted = true;
  console.log(
    `[blive] Ciel 已启动，FFmpeg 每 ${imageInterval ?? defaultImageInterval}ms 输出一张 Photon`,
  );
  console.log('[blive] 按 Ctrl+C 退出');
  await closed;
  if (!shuttingDown) await shutdown('SIGTERM');
  clearInterval(report);
} catch (error) {
  clearInterval(report);
  if (cielStarted) await ciel.stop().catch(() => undefined);
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exitCode = 1;
} finally {
  await bridge.stop().catch(() => undefined);
  await memory.close().catch(error => {
    console.error(
      `[memory] ${formatCielError(error instanceof Error ? error : new Error(String(error)))}`,
    );
  });
}

function readPositiveNumber(value: string, name: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error(`${name}必须是正整数`);
  }
  return number;
}

function readOptionalPositiveNumber(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  return readPositiveNumber(value, 'BLIVE_IMAGE_INTERVAL');
}

function formatCielError(error: Error): string {
  const detail = error.stack ?? error.message;
  if (error.message.includes('No endpoints found that support image input')) {
    return [
      '当前 AI 模型不支持图片输入。',
      '请将 BLIVE_AI_MODEL 设置为同时支持 image input 与 embeddings 的模型；',
      'Oculus 会将 9 帧合成为一张 1920x1080 JPEG 后提交。',
      detail,
    ].join(' ');
  }
  return detail;
}
