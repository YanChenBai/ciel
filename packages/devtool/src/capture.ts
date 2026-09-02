import type { TelemetrySerializer } from './serializer.ts';
import type { TelemetryError } from './types.ts';

export function captureError(error: unknown): TelemetryError {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      ...(error.stack ? { stack: error.stack } : {}),
    };
  }

  return {
    message: typeof error === 'string' ? error : 'Unknown telemetry operation error',
    name: 'Error',
  };
}

/**
 * 遥测快照失败时返回占位文本 绝不影响被观察的运行时
 */
export function captureValue(serializer: TelemetrySerializer, value: unknown): string {
  try {
    return serializer.stringify(value);
  } catch (error) {
    const captured = captureError(error);
    return JSON.stringify({ serializationError: captured });
  }
}
