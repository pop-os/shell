export const OK = 1;
export const ERR = 2;

export type Result<T, E> = Ok<T> | Err<E>;

export interface Ok<T> {
    kind: 1,
    value: T
}

export interface Err<T> {
    kind: 2,
    value: T
}

export function Ok<T, E>(value: T): Result<T, E> {
    return { kind: 1, value: value };
}

export function Err<T, E>(value: E): Result<T, E> {
    return { kind: 2, value: value }
}

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

    * chain(): IterableIterator<Error> {
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
