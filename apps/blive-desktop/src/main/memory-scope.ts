import { createMemoryResourceId } from '@ciels/core';

export function createBliveMemoryResourceId(accountUid?: number): string {
  return createMemoryResourceId('blive-desktop', 'account', accountUid ?? 'anonymous');
}
