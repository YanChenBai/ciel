# @ciels/interceptor

与运行时无关的函数拦截协议和组合器，供 Ciel 的不同包复用。

## 使用

```ts
import { createInstrumenter } from '@ciels/interceptor';
import type { AnyFunction, Interceptor } from '@ciels/interceptor';

const logger: Interceptor = {
  intercept<T extends AnyFunction>(target: T, context) {
    return next =>
      function (this: ThisParameterType<T>, ...args: Parameters<T>) {
        console.log(context?.name ?? target.name, context?.metadata, args);
        return Reflect.apply(next, this, args);
      } as T;
  },
};

const instrument = createInstrumenter([logger]);
const greet = instrument((name: string) => `Hello, ${name}`, {
  name: 'example.greet',
  metadata: {
    source: 'README',
  },
});
```

`intercept(target, context)` 返回 wrapper 时包裹目标，返回 `undefined` 时跳过。先声明的
Interceptor 位于调用链外层；每个 Instrumenter 独立匹配并缓存自己的 wrapper 组合。
`context` 是可选的，Instrumenter 会把调用方提供的对象原样转发给每个 Interceptor。
