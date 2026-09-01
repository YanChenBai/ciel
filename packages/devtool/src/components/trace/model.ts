import type { OperationRecord } from '@ciels/devtool-protocol';

export type TraceLane = 'agent' | 'context' | 'model' | 'room' | 'tool';

export const traceLanes: readonly { id: TraceLane; label: string }[] = [
  { id: 'agent', label: 'Agent' },
  { id: 'context', label: 'Context' },
  { id: 'model', label: 'Model' },
  { id: 'tool', label: 'Tools' },
  { id: 'room', label: 'Room' },
];

export function isVisibleTrace(operation: OperationRecord): boolean {
  return (
    operation.name === 'ciel.agent.think' ||
    operation.name === 'ciel.agent.prompt' ||
    operation.name === 'ciel.agent.generate' ||
    operation.name === 'ciel.agent.tool.execute' ||
    operation.name.startsWith('watch-blive.room.')
  );
}

export function operationLabel(operation: OperationRecord): string {
  const tool = operation.attributes.toolLabel ?? operation.attributes.toolName;
  if (typeof tool === 'string') return tool;
  return (
    {
      'ciel.agent.think': 'Agent 思考',
      'ciel.agent.prompt': 'Agent 输入',
      'ciel.agent.generate': '模型生成',
      'watch-blive.room.list': '获取直播间候选',
      'watch-blive.room.open': '切换直播间',
    }[operation.name] ?? operation.name
  );
}

export function operationLane(operation: OperationRecord): TraceLane {
  if (operation.name === 'ciel.agent.think') return 'agent';
  if (operation.name === 'ciel.agent.prompt') return 'context';
  if (operation.name === 'ciel.agent.generate') return 'model';
  if (operation.name === 'ciel.agent.tool.execute') return 'tool';
  return 'room';
}

export function operationTag(operation: OperationRecord): string {
  return operationLane(operation).toLocaleUpperCase();
}
