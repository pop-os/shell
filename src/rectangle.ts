export class Rectangle {
    array: [number, number, number, number];

    constructor(array: [number, number, number, number]) {
        this.array = array;
    }

    static from_meta(meta: Rectangular): Rectangle {
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

    apply(other: Rectangle) {
        this.x += other.x;
        this.y += other.y;
        this.width += other.width;
        this.height += other.height;
    }

    clamp(other: Rectangular) {
        this.x = Math.max(other.x, this.x);
        this.y = Math.max(other.y, this.y);

        let tend = this.x + this.width,
            oend = other.x + other.width;
        if (tend > oend) {
            this.width = oend - this.x;
        }

        tend = this.y + this.height;
        oend = other.y + other.height;
        if (tend > oend) {
            this.height = oend - this.y;
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

    contains(other: Rectangular): boolean {
        return (
            this.x <= other.x &&
            this.y <= other.y &&
            this.x + this.width >= other.x + other.width &&
            this.y + this.height >= other.y + other.height
        );
    }

    diff(other: Rectangular): Rectangle {
        return new Rectangle([
            other.x - this.x,
            other.y - this.y,
            other.width - this.width,
            other.height - this.height
        ]);
    }

    eq(other: Rectangular): boolean {
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

    intersects(other: Rectangular): boolean {
        return (this.x < (other.x + other.width) && (this.x + this.width) > other.x)
            && (this.y < (other.y + other.height) && (this.y + this.height) > other.y);
    }
}
