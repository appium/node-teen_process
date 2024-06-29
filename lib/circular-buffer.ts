export const MAX_BUFFER_SIZE = 100 * 1024 * 1024; // 100 MiB
const THRESHOLD = 0.15;

export class CircularBuffer {
  private _buf: Buffer[];
  private _size: number;
  private _maxSize: number;

  constructor(maxSize = MAX_BUFFER_SIZE) {
    this._maxSize = maxSize;
    this._buf = [];
    this._size = 0;
  }

  get size(): number {
    return this._size;
  }

  get count(): number {
    return this._buf.length;
  }

  public add(item: Buffer): this {
    this._buf.push(item);
    this._size += item.length;
    this._align();
    return this;
  }

  public value(): Buffer {
    return Buffer.concat(this._buf);
  }

  private _align(): void {
    if (this._size <= this._maxSize) {
      return;
    }

    let numberOfItemsToShift = 0;
    // We add the threshold to avoid shifting the array for each `add` call,
    // which reduces the CPU usage
    const expectedSizeToShift = this._size - this._maxSize + Math.trunc(this._maxSize * THRESHOLD);
    let actualShiftedSize = 0;
    while (numberOfItemsToShift < this._buf.length - 1 && actualShiftedSize <= expectedSizeToShift) {
      actualShiftedSize += this._buf[numberOfItemsToShift].length;
      numberOfItemsToShift++;
    }
    if (numberOfItemsToShift > 0) {
      this._buf.splice(0, numberOfItemsToShift);
      this._size -= actualShiftedSize;
    }
    if (actualShiftedSize < expectedSizeToShift) {
      // We have already deleted all buffer items, but one,
      // although the recent item is still too big to fit into the allowed size limit
      const remainderToShift = expectedSizeToShift - actualShiftedSize;
      this._buf[0] = this._buf[0].subarray(remainderToShift);
      this._size -= remainderToShift;
    }
  }
}