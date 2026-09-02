import type { DevtoolProtocolError } from '@ciels/devtool-protocol';

export class DevtoolRequestError extends Error {
  readonly protocolError: DevtoolProtocolError;

  constructor(error: DevtoolProtocolError) {
    super(error.message);
    this.name = 'DevtoolRequestError';
    this.protocolError = error;
  }
}
