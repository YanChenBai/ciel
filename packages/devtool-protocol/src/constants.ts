export const DevtoolProtocol = {
  Name: 'ciel.devtool',
  Version: 1,
} as const;

export type DevtoolProtocolName = typeof DevtoolProtocol.Name;
export type DevtoolProtocolVersion = typeof DevtoolProtocol.Version;
