// @env node

import { readFile } from 'node:fs/promises';

import type { FilePart } from 'ai';
import sharp from 'sharp';

const PATCH_SIZE = 16;
const SPATIAL_MERGE_SIZE = 2;
const IMAGE_MIN_PIXELS = 8_192;
const IMAGE_MAX_PIXELS = 8_388_608;

function roundHalfToEven(value: number): number {
  const floor = Math.floor(value);
  const fraction = value - floor;
  if (fraction !== 0.5) {
    return Math.round(value);
  }
  return floor % 2 === 0 ? floor : floor + 1;
}

export function calculateImageTokens(width: number, height: number): number {
  const factor = PATCH_SIZE * SPATIAL_MERGE_SIZE;
  let heightBar = roundHalfToEven(height / factor) * factor;
  let widthBar = roundHalfToEven(width / factor) * factor;

  if (heightBar * widthBar > IMAGE_MAX_PIXELS) {
    const beta = Math.sqrt((height * width) / IMAGE_MAX_PIXELS);
    heightBar = Math.floor(height / beta / factor) * factor;
    widthBar = Math.floor(width / beta / factor) * factor;
  } else if (heightBar * widthBar < IMAGE_MIN_PIXELS) {
    const beta = Math.sqrt(IMAGE_MIN_PIXELS / (height * width));
    heightBar = Math.ceil(height / beta / factor) * factor;
    widthBar = Math.ceil(width / beta / factor) * factor;
  }

  const gridHeight = heightBar / PATCH_SIZE;
  const gridWidth = widthBar / PATCH_SIZE;
  return Math.floor((gridHeight * gridWidth) / SPATIAL_MERGE_SIZE ** 2);
}

/**
 * 按模型图片缩放规则估算 token，实际用量以 API 响应为准
 */
export async function estimateImageTokens(path: string): Promise<number> {
  const { width, height } = await sharp(path).metadata();
  if (!width || !height) {
    throw new Error(`Cannot read image dimensions: ${path}`);
  }
  return calculateImageTokens(width, height);
}

/**
 * 将本地 JPEG 转成 OpenAI-compatible provider 可序列化为 data URL 的图片 part
 */
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
