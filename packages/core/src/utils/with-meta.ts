type Constructor = abstract new (...args: any[]) => any;

export function WithMeta<TBase extends Constructor, const TMeta extends object>(
  Base: TBase,
  meta: TMeta,
) {
  abstract class WithMeta extends Base {
    static readonly meta = meta;
  }

  return WithMeta;
}
