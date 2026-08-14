import { Echo, Photon } from '@ciels/core';

export class BilibiliAudio extends Echo.WithMeta({
  name: '直播声音',
  description: '直播间中主播、嘉宾及其他现场声音的单声道 16kHz PCM 音频',
}) {}

export class BilibiliVideo extends Photon.WithMeta({
  name: '直播画面',
  description: '从直播视频流按固定间隔取得的 JPEG 画面',
}) {}

export const bilibiliLiveSignals = [BilibiliAudio, BilibiliVideo] as const;
