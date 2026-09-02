import type { ProjectorContext } from '#extension';
import { createEngramView, type EngramEntry } from '#model/engram/index.ts';
import type { LLMContext } from '#model/llm/index.ts';

import type { ResolvedProjector } from './extensions.ts';
import { cielOperation, CielOperation } from './instrumentation.ts';

export type ProjectorRunner = (
  entries: readonly EngramEntry[],
) => Promise<Readonly<Record<string, LLMContext>>>;

/**
 * 将 Projector Extension 绑定为可执行的上下文投影
 */
export function createProjectorRunner(definitions: readonly ResolvedProjector[]): ProjectorRunner {
  const projectors = definitions.map(
    ({ extension, instrument }) =>
      [
        extension.name,
        instrument(
          extension.project,
          cielOperation(CielOperation.ProjectorProject, {
            projectorKey: extension.name,
            projectorName: extension.name,
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
