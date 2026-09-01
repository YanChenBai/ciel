import { createSerializer } from '@ciels/telemetry';
import { describe, expect, it } from 'vite-plus/test';

import { devtoolTransformers, sanitizeDevtoolValue } from './devtool.ts';

describe('sanitizeDevtoolValue', () => {
  it('只传输二进制摘要并保留 Agent 文本', () => {
    const value = sanitizeDevtoolValue({
      audio: Buffer.alloc(3_200),
      image: new Uint8Array(512),
      content: '完整的 Agent 输入输出',
      data: 'A'.repeat(2_048),
    });

    expect(value).toEqual({
      audio: '[Buffer 3200 bytes]',
      image: '[Uint8Array 512 bytes]',
      content: '完整的 Agent 输入输出',
      data: '[Binary string 2048 characters]',
    });
  });

  it('在遥测捕获前通过 SuperJSON transformer 摘要媒体数据', () => {
    const serializer = createSerializer(devtoolTransformers);
    const value = serializer.parse(
      serializer.stringify({
        audio: Buffer.alloc(3_200),
        content: { type: 'image', data: 'A'.repeat(2_048), mimeType: 'image/jpeg' },
      }),
    );

    expect(value).toEqual({
      audio: '[Buffer 3200 bytes]',
      content: {
        type: 'image',
        data: '[Image data 2048 characters]',
        mimeType: 'image/jpeg',
      },
    });
  });
});
