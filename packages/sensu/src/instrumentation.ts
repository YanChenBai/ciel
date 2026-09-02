export const SensuOperationTag = {
  Sensu: 'SENSU',
} as const;

export const SensuOperation = {
  ASRInput: {
    name: 'ciel.sensu.asr.input',
    label: 'ASR Input',
    tag: SensuOperationTag.Sensu,
  },
  ASROutput: {
    name: 'ciel.sensu.asr.output',
    label: 'ASR Output',
    tag: SensuOperationTag.Sensu,
  },
} as const;
