export const DataType = {
  Signal: 'signal',
  Percept: 'percept',
  Cue: 'cue',
} as const;

export type DataType = (typeof DataType)[keyof typeof DataType];

export interface CielData<TType extends DataType = DataType> {
  /**
   * 数据实例的 UUIDv7 标识
   */
  readonly id: string;
  /**
   * 数据类型
   */
  readonly type: TType;
}
