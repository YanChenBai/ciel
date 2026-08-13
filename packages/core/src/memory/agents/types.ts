export interface MemoryAgent<TInput, TOutput> {
  run(input: TInput): Promise<TOutput>;
}
