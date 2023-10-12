export class OnceCell<T> {
    value: T | undefined;

    constructor() {}

    get_or_init(callback: () => T): T {
        if (this.value === undefined) {
            this.value = callback();
        }

        return this.value;
    }
}
