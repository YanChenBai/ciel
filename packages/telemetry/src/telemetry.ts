import type { Attributes } from '@opentelemetry/api';
import { trace, SpanStatusCode } from '@opentelemetry/api';

import { createSerializer } from './serializer.ts';
import type { TelemetryOptions, Transformer } from './types.ts';

export function defineTelemetry(options: TelemetryOptions) {
  const tracer = trace.getTracer(options.name, options.version);
  const serializer = createSerializer({
    transformers: options.transformers,
  });

  function run(name: string) {
    return {
      input() {
        return {
          handle() {
            return {
              execute() {},
            };
          },
        };
      },
    };
  }
}
