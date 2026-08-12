// @env node

import path from 'node:path';

import sharp from 'sharp';

import { Sight } from '#percepts';

import { Oculus } from './oculus.ts';

interface FrameSlot {
  readonly frame: number;
  readonly height: number;
  readonly left: number;
  readonly top: number;
  readonly width: number;
}

const OUTPUT_WIDTH = 1920;
const OUTPUT_HEIGHT = 1080;

function distributeFrames(frameCount: number, rows: number): number[] {
  const base = Math.floor(frameCount / rows);
  const remainder = frameCount % rows;
  return Array.from({ length: rows }, (_, row) => base + Number(row < remainder));
}

function resolveHeightCap(maximumHeights: readonly number[]): number {
  const total = maximumHeights.reduce((sum, height) => sum + height, 0);
  if (total <= OUTPUT_HEIGHT) {
    return Math.max(...maximumHeights);
  }

  let lower = 0;
  let upper = Math.max(...maximumHeights);
  for (let iteration = 0; iteration < 32; iteration += 1) {
    const middle = (lower + upper) / 2;
    const used = maximumHeights.reduce((sum, height) => sum + Math.min(height, middle), 0);
    if (used <= OUTPUT_HEIGHT) {
      lower = middle;
    } else {
      upper = middle;
    }
  }
  return lower;
}

function createFrameSlots(aspectRatios: readonly number[]): FrameSlot[] {
  const minimumRows = Math.ceil(aspectRatios.length / Oculus.COLS);
  const maximumRows = Math.min(Oculus.ROWS, aspectRatios.length);
  let best: { area: number; slots: FrameSlot[] } | undefined;

  for (let rows = minimumRows; rows <= maximumRows; rows += 1) {
    const rowCounts = distributeFrames(aspectRatios.length, rows);
    const rowRatios: number[][] = [];
    let offset = 0;
    for (const count of rowCounts) {
      rowRatios.push(aspectRatios.slice(offset, offset + count));
      offset += count;
    }

    const maximumHeights = rowRatios.map(
      ratios => OUTPUT_WIDTH / ratios.reduce((sum, ratio) => sum + ratio, 0),
    );
    const heightCap = resolveHeightCap(maximumHeights);
    const heights = maximumHeights.map(height =>
      Math.max(1, Math.floor(Math.min(height, heightCap))),
    );
    const totalHeight = heights.reduce((sum, height) => sum + height, 0);
    let top = Math.floor((OUTPUT_HEIGHT - totalHeight) / 2);
    let frame = 0;
    const slots: FrameSlot[] = [];

    for (let row = 0; row < rows; row += 1) {
      const height = heights[row]!;
      const widths = rowRatios[row]!.map(ratio => Math.max(1, Math.floor(height * ratio)));
      let left = Math.floor((OUTPUT_WIDTH - widths.reduce((sum, width) => sum + width, 0)) / 2);
      for (const width of widths) {
        slots.push({ frame, left, top, width, height });
        frame += 1;
        left += width;
      }
      top += height;
    }

    const area = slots.reduce((sum, slot) => sum + slot.width * slot.height, 0);
    if (best === undefined || area > best.area) {
      best = { area, slots };
    }
  }

  return best?.slots ?? [];
}

function createFrameLabel(frame: number): Buffer {
  return Buffer.from(
    `<svg width="44" height="44"><rect width="44" height="44" rx="8" fill="rgba(0,0,0,.7)"/><text x="22" y="30" text-anchor="middle" font-size="24" font-family="sans-serif" fill="white">${frame}</text></svg>`,
  );
}

/**
 * 将同一视觉来源的一个至九个变化帧拼成单个 Sight。
 */
export async function composeSight(frames: readonly Sight[]): Promise<Sight> {
  if (frames.length === 0 || frames.length > Oculus.FRAME_COUNT) {
    throw new Error(`Oculus can compose between 1 and ${Oculus.FRAME_COUNT} frames`);
  }

  const sorted = frames.toSorted(
    (left, right) =>
      left.startAt.getTime() - right.startAt.getTime() ||
      left.endAt.getTime() - right.endAt.getTime(),
  );
  const first = sorted[0]!;
  const last = sorted.at(-1)!;
  if (sorted.some(frame => frame.originSignal !== first.originSignal)) {
    throw new Error('Oculus can only compose frames from the same signal source');
  }

  const metadata = await Promise.all(sorted.map(frame => sharp(frame.path).metadata()));
  const slots = createFrameSlots(
    metadata.map(value =>
      value.width && value.height ? value.width / value.height : OUTPUT_WIDTH / OUTPUT_HEIGHT,
    ),
  );
  const images = await Promise.all(
    slots.map((slot, index) =>
      sharp(sorted[index]!.path)
        .resize(slot.width, slot.height, {
          background: { r: 0, g: 0, b: 0 },
          fit: 'contain',
          position: 'centre',
        })
        .jpeg({ quality: 85 })
        .toBuffer(),
    ),
  );
  const composite = slots.flatMap((slot, index) => [
    {
      input: images[index]!,
      left: slot.left,
      top: slot.top,
    },
    {
      input: createFrameLabel(slot.frame + 1),
      left: slot.left + 12,
      top: slot.top + 12,
    },
  ]);
  const firstName = path.parse(first.path).name;
  const lastName = path.parse(last.path).name;
  const outputPath = path.join(path.dirname(first.path), `context-${firstName}-${lastName}.jpg`);
  await sharp({
    create: {
      width: OUTPUT_WIDTH,
      height: OUTPUT_HEIGHT,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  })
    .composite(composite)
    .jpeg({ quality: 85 })
    .toFile(outputPath);

  return new Sight({
    path: outputPath,
    startAt: first.startAt,
    endAt: last.endAt,
    originSignal: first.originSignal,
  });
}
