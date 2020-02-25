export class Rectangle {
  array: [number, number, number, number];

  constructor(array: [number, number, number, number]) {
    this.array = array;
  }

  static from_meta(meta: any): Rectangle {
    return new Rectangle([meta.x, meta.y, meta.width, meta.height]);
  }

  get x() { return this.array[0]; }

  set x(x: number) { this.array[0] = x; }

  get y() { return this.array[1]; }

  set y(y: number) { this.array[1] = y; }

  get width(): number { return this.array[2]; }

  set width(width: number) { this.array[2] = width; }

  get height() { return this.array[3]; }

  set height(height: number) { this.array[3] = height; }

  clamp(other: Rectangle, outer: number) {
    this.x = Math.max(0, this.x);
    this.y = Math.max(0, this.y);

    const xend = this.x + this.width;
    const work_width = other.width - outer;
    if (xend > work_width) {
      this.width = work_width - this.x;
    }

    const yend = this.y + this.height;
    const work_height = other.height;
    if (yend > work_height) {
      this.height = work_height - this.y;
    }
  }

  clone(): Rectangle {
    return new Rectangle([
      this.array[0],
      this.array[1],
      this.array[2],
      this.array[3]
    ]);
  }

  contains(other: Rectangle): boolean {
    return (
      this.x <= other.x &&
      this.y <= other.y &&
      this.x + this.width >= other.x + other.width &&
      this.y + this.height >= other.y + other.height
    );
  }

  eq(other: Rectangle): boolean {
    return (
      this.x == other.x &&
      this.y == other.y &&
      this.width == other.width &&
      this.height == other.height
    );
  }

  fmt(): string {
    return `Rect(${[this.x, this.y, this.width, this.height]})`;
  }
}
