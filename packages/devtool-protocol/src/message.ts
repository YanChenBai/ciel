import type { DevtoolCapabilities } from './capability.ts';
import type { DevtoolProtocolName, DevtoolProtocolVersion } from './constants.ts';
import type { DevtoolEvent } from './event.ts';
import type { DevtoolRequest, DevtoolResponse } from './request.ts';
import type { TargetDescriptor } from './target.ts';

interface DevtoolMessageEnvelopeBase {
  readonly protocol: DevtoolProtocolName;
  readonly version: DevtoolProtocolVersion;
  readonly id: string;
}

export interface DevtoolHello extends DevtoolMessageEnvelopeBase {
  readonly type: 'hello';
  readonly client: {
    readonly name: string;
    readonly version?: string;
  };
  readonly supportedVersions: readonly number[];
}

export interface DevtoolWelcome extends DevtoolMessageEnvelopeBase {
  readonly type: 'welcome';
  readonly epoch: string;
  readonly target: TargetDescriptor;
  readonly capabilities: DevtoolCapabilities;
}

export type DevtoolMessage =
  | DevtoolHello
  | DevtoolWelcome
  | DevtoolRequest
  | DevtoolResponse
  | DevtoolEvent;

export type DevtoolConsumerMessage = DevtoolHello | DevtoolRequest;
export type DevtoolProviderMessage = DevtoolWelcome | DevtoolResponse | DevtoolEvent;
