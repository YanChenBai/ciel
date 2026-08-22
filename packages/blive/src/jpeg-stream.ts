const JPEG_START = Buffer.from([0xff, 0xd8]);
const JPEG_END = Buffer.from([0xff, 0xd9]);

/** 从 FFmpeg image2pipe 的任意 chunk 边界中恢复完整 JPEG。 */
export class JpegStreamParser {
  private buffer = Buffer.alloc(0);

  push(chunk: Buffer): Buffer[] {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const images: Buffer[] = [];
    while (true) {
      const start = this.buffer.indexOf(JPEG_START);
      if (start < 0) {
        this.buffer = this.buffer.subarray(-1);
        break;
      }
      const end = this.buffer.indexOf(JPEG_END, start + JPEG_START.length);
      if (end < 0) {
        if (start > 0) this.buffer = this.buffer.subarray(start);
        break;
      }
      images.push(Buffer.from(this.buffer.subarray(start, end + JPEG_END.length)));
      this.buffer = this.buffer.subarray(end + JPEG_END.length);
    }
    return images;
  }

  clear(): void {
    this.buffer = Buffer.alloc(0);
  }
}
