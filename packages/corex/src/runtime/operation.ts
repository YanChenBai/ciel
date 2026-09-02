export interface Operation<TName extends string = string> {
  readonly name: TName;
  readonly label: string;
  readonly tag: string;
}
