import { VigiliaOperations } from '#vigilia';
import type { VigiliaChannel, VigiliaOperationContext } from '#vigilia';

/** Context 只描述自己构建和解析模型输入的 operation。 */
export class ContextOperations {
  private readonly operations: VigiliaOperations;

  constructor(channel: VigiliaChannel) {
    this.operations = new VigiliaOperations(channel);
  }

  observe<Result>(
    name: string,
    action: () => Promise<Result>,
    context?: VigiliaOperationContext,
  ): Promise<Result> {
    return this.operations.observe(
      {
        category: 'context',
        name,
        parentOperationId: context?.parentOperationId,
      },
      action,
    );
  }
}
