import type { AnyVigiliaEvent, VigiliaSnapshot } from '@ciels/core';

export type { AnyVigiliaEvent, VigiliaSnapshot } from '@ciels/core';

export type BridgeMessage =
  | {
      readonly events: readonly AnyVigiliaEvent[];
      readonly snapshot: VigiliaSnapshot;
      readonly type: 'vigilia.bootstrap';
    }
  | {
      readonly event: AnyVigiliaEvent;
      readonly snapshot: VigiliaSnapshot;
      readonly type: 'vigilia.event';
    };
