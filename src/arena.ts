/** Hop slot arena allocator */
export class Arena<T> {
    private slots: Array<null | T> = new Array();
    private unused: Array<number> = new Array()

    truncate(n: number) {
        this.slots.splice(n);
        this.unused.splice(n);
    }

    get(n: number): null | T {
        return this.slots[n];
    }

    insert(v: T): number {
        let n;
        const slot = this.unused.pop();
        if (slot !== undefined) {
            n = slot;
            this.slots[n] = v;
        } else {
            n = this.slots.length;
            this.slots.push(v);
        }

        return n;
    }

    remove(n: number): null | T {
        const v = this.slots[n];
        this.slots[n] = null;
        this.unused.push(n);
        return v;
    }

    * values(): IterableIterator<T> {
        for (const v of this.slots) {
            if (v !== null) yield v;
        }
    }
}
