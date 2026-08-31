import { describe, expect, expectTypeOf, it } from 'vite-plus/test';

import {
  DevtoolEventName,
  DevtoolProtocol,
  DevtoolRequestName,
  type DevtoolEventOf,
  type DevtoolMessage,
  type DevtoolRequestInput,
  type DevtoolRequestOutput,
  type OperationPage,
  type OperationQuery,
} from '../src/index.ts';

describe('@ciels/devtool-protocol', () => {
  it('couples request names with their input and output types', () => {
    expectTypeOf<
      DevtoolRequestInput<typeof DevtoolRequestName.OperationQuery>
    >().toEqualTypeOf<OperationQuery>();
    expectTypeOf<
      DevtoolRequestOutput<typeof DevtoolRequestName.OperationQuery>
    >().toEqualTypeOf<OperationPage>();
  });

  it('preserves event payload narrowing', () => {
    const event: DevtoolEventOf<typeof DevtoolEventName.TargetDisposed> = {
      protocol: DevtoolProtocol.Name,
      version: DevtoolProtocol.Version,
      id: 'event-1',
      type: 'event',
      cursor: { targetId: 'ciel-main', epoch: 'epoch-1', sequence: 1 },
      time: 100,
      name: DevtoolEventName.TargetDisposed,
      payload: { reason: 'stopped' },
    };

    expect(event.payload.reason).toBe('stopped');
  });

  it('contains only JSON-compatible message data', () => {
    const message: DevtoolMessage = {
      protocol: DevtoolProtocol.Name,
      version: DevtoolProtocol.Version,
      id: 'request-1',
      type: 'request',
      name: DevtoolRequestName.OperationQuery,
      payload: { after: 1, limit: 20 },
    };

    expect(JSON.parse(JSON.stringify(message))).toEqual(message);
  });
});
