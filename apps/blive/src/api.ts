import { BilibiliApiError, RoomNotLiveError } from './errors.ts';
import type { BilibiliApiRequestOptions } from './types.ts';

const PLAY_INFO_ENDPOINT = 'https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo';
const DEFAULT_TIMEOUT = 10_000;
const DEFAULT_RETRY_LIMIT = 2;
const DEFAULT_RETRY_BACKOFF = 300;
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

interface PlayInfoResponse {
  readonly code: number;
  readonly message: string;
  readonly data?: {
    readonly live_status?: number;
    readonly playurl_info?: {
      readonly playurl?: {
        readonly stream?: readonly {
          readonly protocol_name?: string;
          readonly format?: readonly {
            readonly format_name?: string;
            readonly codec?: readonly {
              readonly codec_name?: string;
              readonly base_url?: string;
              readonly url_info?: readonly { readonly host?: string; readonly extra?: string }[];
            }[];
          }[];
        }[];
      };
    } | null;
  };
}

/** 解析适合 FFmpeg 读取的 Bilibili AVC FLV 地址。 */
export async function fetchBilibiliFlvUrl(
  roomId: number,
  options: BilibiliApiRequestOptions = {},
): Promise<string> {
  assertRoomId(roomId);
  const url = new URL(PLAY_INFO_ENDPOINT);
  const parameters = {
    room_id: roomId,
    protocol: '0,1',
    format: '0,1,2',
    codec: '0,1,2',
    qn: 10_000,
    platform: 'web',
    ptype: 8,
    dolby: 5,
    panoramic: 1,
  };
  for (const [name, value] of Object.entries(parameters)) {
    url.searchParams.set(name, String(value));
  }

  const response = await request(url, options);
  const body = (await response.json()) as PlayInfoResponse;
  if (body.code !== 0) throw new BilibiliApiError(body.code, body.message);
  if (body.data?.live_status !== 1 || !body.data.playurl_info) {
    throw new RoomNotLiveError(roomId);
  }

  const stream = body.data.playurl_info.playurl?.stream?.find(
    item => item.protocol_name === 'http_stream',
  );
  const format = stream?.format?.find(item => item.format_name === 'flv');
  const codec =
    format?.codec?.find(item => item.codec_name?.toLowerCase() === 'avc') ?? format?.codec?.[0];
  const urlInfo = codec?.url_info?.[0];
  if (!codec?.base_url || !urlInfo?.host) {
    throw new Error(`Missing FLV stream info for room ${roomId}`);
  }
  return `${urlInfo.host}${codec.base_url}${urlInfo.extra ?? ''}`;
}

async function request(url: URL, options: BilibiliApiRequestOptions): Promise<Response> {
  const retryLimit = options.retryLimit ?? DEFAULT_RETRY_LIMIT;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT;
  const retryBackoffMs = options.retryBackoffMs ?? DEFAULT_RETRY_BACKOFF;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retryLimit; attempt += 1) {
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal,
      });
    } catch (error) {
      if (options.signal?.aborted) throw options.signal.reason;
      lastError = error;
      if (attempt < retryLimit) {
        await delay(retryBackoffMs * 2 ** attempt, options.signal);
      }
      continue;
    }
    if (response.ok) return response;
    lastError = new Error(`Bilibili API HTTP ${response.status}`);
    if (!RETRYABLE_STATUS.has(response.status)) throw lastError;
    if (attempt < retryLimit) {
      await delay(retryBackoffMs * 2 ** attempt, options.signal);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Bilibili API request failed');
}

function delay(duration: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, duration);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

function assertRoomId(roomId: number): void {
  if (!Number.isSafeInteger(roomId) || roomId <= 0) {
    throw new Error('roomId must be a positive safe integer');
  }
}
