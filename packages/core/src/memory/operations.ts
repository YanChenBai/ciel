import { VigiliaOperations } from '#vigilia';
import type { VigiliaChannel, VigiliaOperationContext } from '#vigilia';

/** Memory 在实际存取位置记录自己的 operation，上层只传递可选父级关系。 */
export class MemoryOperations {
  private readonly operations: VigiliaOperations;

  constructor(channel: VigiliaChannel) {
    this.operations = new VigiliaOperations(channel);
  }

  observe<Result>(
    name: string,
    action: () => Promise<Result>,
    context?: VigiliaOperationContext,
    detail?: unknown,
  ): Promise<Result> {
    return this.operations.observe(
      {
        category: 'memory',
        detail,
        name,
        parentOperationId: context?.parentOperationId,
      },
      action,
    );
  }
}
