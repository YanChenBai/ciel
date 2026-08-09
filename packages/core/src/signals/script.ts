export interface ScriptData {
  content: string;
  capturedAt: Date;
}

export abstract class Script {
  readonly type = 'script' as const;
  readonly content: string;
  readonly capturedAt: Date;
  static readonly prompt: string;

  constructor(readonly data: ScriptData) {
    this.content = data.content;
    this.capturedAt = data.capturedAt;
  }
}
