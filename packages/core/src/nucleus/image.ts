// @env node

import { readFile } from 'node:fs/promises';

import type { FilePart } from 'ai';

/** 将本地 JPEG 转成 OpenAI-compatible provider 可序列化为 data URL 的图片 part。 */
export async function resolveImagePart(path: string): Promise<FilePart> {
  return {
    type: 'file',
    mediaType: 'image/jpeg',
    data: {
      type: 'data',
      data: (await readFile(path)).toString('base64'),
    },
  };
}
