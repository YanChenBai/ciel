import { randomUUID } from 'node:crypto';

import { definePlugin, type PluginRuntimeContext } from '@cieljs/core';

import { createDevtoolBridge } from '../bridge/index.ts';
import { createTelemetry } from '../telemetry.ts';
import { createCielTarget } from './target.ts';
import type { DevtoolsOptions } from './types.ts';

export const devtools = definePlugin((options: DevtoolsOptions) => {
  const telemetry = createTelemetry();
  let close: (() => Promise<void>) | undefined;
  telemetry({ capture: options.capture, transformers: options.transformers });

  return {
    name: options.name ?? 'devtools',
    ...(options.description ? { description: options.description } : {}),
    interceptors: [telemetry],
    activate({ ciel }: PluginRuntimeContext) {
      const bridge = createDevtoolBridge({
        createId: randomUUID,
        epoch: randomUUID(),
        target: createCielTarget({
          ciel,
          telemetry,
          name: options.name ?? ciel.id,
          ...(options.description ? { description: options.description } : {}),
        }),
      });
      bridge.attach(options.adapter);
      close = () => bridge.close();
    },
    async deactivate() {
      await close?.();
      close = undefined;
    },
    dispose() {
      telemetry.clear();
    },
  };
});
