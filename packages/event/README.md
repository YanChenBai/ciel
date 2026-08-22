# @ciels/event

Ciel 共用的轻量类型事件工具，无运行时依赖。

## EventEmitter

用于组合事件能力：

```ts
const events = new EventEmitter<{
  message(value: string): void | Promise<void>;
}>();

const off = events.$on.message(value => console.log(value));
events.$emit.message('立即触发');
await events.$emitAsync.message('等待监听器');
off();
```

- `emit()` / `$emit`：同步触发，不等待异步监听器。
- `emitAsync()` / `$emitAsync`：等待当前全部监听器完成。
- `once()` / `$once`：触发前自动取消订阅。
- `clear()`：清除指定事件或全部监听器。

## EventHost

当外部只能订阅、只有类内部可以触发事件时，继承 `EventHost`：

```ts
class Channel extends EventHost<{ value(value: number): void }> {
  publish(value: number) {
    this.$emit.value(value);
  }
}

const channel = new Channel();
const off = channel.$on.value(value => console.log(value));
channel.publish(1);
off();
```

`inheritEvents(source, ...events)` 可转发名称相同且参数兼容的事件，返回值用于停止全部转发。

## 验证

```bash
vp check
vp test
vp pack
```
