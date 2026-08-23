const VIGILIA_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Vigilia name 是稳定的机器标识，统一使用 kebab-case。 */
export function isVigiliaName(value: string): boolean {
  return VIGILIA_NAME_PATTERN.test(value);
}

/** 将外部动态名称收敛为 Vigilia 可接受的 kebab-case 标识。 */
export function toVigiliaName(value: string, fallback = 'operation'): string {
  const normalized = value
    .trim()
    .replaceAll(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .replaceAll(/([a-z\d])([A-Z])/g, '$1-$2')
    .replaceAll(/[^a-zA-Z\d]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .toLocaleLowerCase();
  return normalized || fallback;
}
