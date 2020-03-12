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
