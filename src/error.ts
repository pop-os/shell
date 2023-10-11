export class Error {
    reason: string;

    cause: Error | null = null;

    constructor(reason: string) {
        this.reason = reason;
    }

    context(why: string): Error {
        let error = new Error(why);
        error.cause = this;
        return error;
    }

    *chain(): IterableIterator<Error> {
        let current: Error | null = this;

        while (current != null) {
            yield current;
            current = current.cause;
        }
    }

    format(): string {
        let causes = this.chain();

        let buffer: string = causes.next().value.reason;

        for (const error of causes) {
            buffer += `\n    caused by: ` + error.reason;
        }

        return buffer + `\n`;
    }
}
