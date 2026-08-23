// @env node

export class BilibiliApiError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = 'BilibiliApiError';
  }
}

export class RoomNotLiveError extends Error {
  constructor(readonly roomId: number) {
    super(`直播间 ${roomId} 当前未开播`);
    this.name = 'RoomNotLiveError';
  }
}
