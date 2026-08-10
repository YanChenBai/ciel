import { WithMeta } from '#src/utils/index.ts';

export interface ScriptData {
  content: string;
  timestamp: Date;
}

export interface ScriptMeta {
  title: string;
  description: string;
}

export abstract class Script {
  static meta: ScriptMeta;

  readonly type = 'script' as const;
  readonly content: string;
  readonly timestamp: Date;

  constructor(readonly data: ScriptData) {
    this.content = data.content;
    this.timestamp = data.timestamp;
  }

  static WithMeta<const TMeta extends ScriptMeta>(meta: TMeta) {
    return WithMeta(Script, meta);
  }
}
