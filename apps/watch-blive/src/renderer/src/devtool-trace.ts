import { defaultTrace, type DevtoolTraceEntry } from '@ciels/devtool';

export const watchBliveTrace: readonly DevtoolTraceEntry[] = [
  ...defaultTrace,
  {
    match: operation => operation.name.startsWith('watch-blive.room.'),
    color: 'var(--trace-vision)',
  },
];
