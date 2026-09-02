import { createEngramView, type EngramEntry } from '#model/engram/index.ts';
import type { LLMContext } from '#model/llm/index.ts';
import type { ProjectorContext } from '#plugin/index.ts';

import { cielOperation, CielOperation } from './instrumentation.ts';
import type { ResolvedProjector } from './plugins.ts';

export type ProjectorRunner = (
  entries: readonly EngramEntry[],
) => Promise<Readonly<Record<string, LLMContext>>>;

/**
 * 将 Projector 绑定为可执行的上下文投影
 */
export function createProjectorRunner(definitions: readonly ResolvedProjector[]): ProjectorRunner {
  const projectors = definitions.map(
    ({ primitive, instrument }) =>
      [
        primitive.name,
        instrument(
          primitive.project,
          cielOperation(CielOperation.ProjectorProject, {
            projectorKey: primitive.name,
            projectorName: primitive.name,
          }),
        ),
      ] as const,
  );

  return async entries => {
    const ctx: ProjectorContext = { engram: createEngramView(entries) };
    const results = await Promise.all(
      projectors.map(async ([name, project]) => [name, await project(ctx)] as const),
    );
    return Object.fromEntries(results);
  };
}
