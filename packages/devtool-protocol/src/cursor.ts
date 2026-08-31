export interface StreamCursor {
  readonly targetId: string;
  readonly epoch: string;
  readonly sequence: number;
}
