import type { DevtoolConsumerMessage, DevtoolProviderMessage } from '@ciels/devtool-protocol';

import type { Dispose, MaybePromise } from '../bridge/index.ts';
import type { TelemetryConfiguration } from '../types.ts';

export interface DevtoolsAdapter {
  send(message: DevtoolProviderMessage): MaybePromise<void>;
  subscribe(listener: (message: DevtoolConsumerMessage) => MaybePromise<void>): Dispose;
  close?(): MaybePromise<void>;
}

export interface DevtoolsOptions extends TelemetryConfiguration {
  readonly adapter: DevtoolsAdapter;
  readonly description?: string;
  readonly name?: string;
}
