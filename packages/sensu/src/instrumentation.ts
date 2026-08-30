export const SensuOperationName = {
  ASRInput: 'ciel.sensu.asr.input',
  ASROutput: 'ciel.sensu.asr.output',
} as const;

export type SensuOperationName = (typeof SensuOperationName)[keyof typeof SensuOperationName];
