/**
 * Based on https://github.com/gustf/js-levenshtein/blob/master/index.js
 * MIT License
 * Copyright (c) 2017 Gustaf Andersson
 */

function _min(d0: number, d1: number, d2: number, bx: number, ay: number): number {
    return d0 < d1 || d2 < d1
        ? d0 > d2
            ? d2 + 1
            : d0 + 1
        : bx === ay
            ? d1
            : d1 + 1
}

export function compare(a: string, b: string): number {
    if (a === b) return 0

    if (a.length > b.length) {
        const tmp = a
        a = b
        b = tmp
    }

    let la = a.length
    let lb = b.length

    while (la > 0 && (a.charCodeAt(la - 1) === b.charCodeAt(lb - 1))) {
        la--
        lb--
    }

    let offset = 0

    while (offset < la && (a.charCodeAt(offset) === b.charCodeAt(offset))) {
        offset++
    }

    la -= offset
    lb -= offset

    if (la === 0 || lb < 3) return lb

    let x = 0,
        y = 0,
        d0 = 0,
        d1 = 0,
        d2 = 0,
        d3 = 0,
        dd = 0,
        dy = 0,
        ay = 0,
        bx0 = 0,
        bx1 = 0,
        bx2 = 0,
        bx3 = 0

    const vector = []

    for (y = 0; y < la; y++) {
      vector.push(y + 1)
      vector.push(a.charCodeAt(offset + y))
    }

    let len = vector.length - 1

    for (; x < lb - 3;) {
        bx0 = b.charCodeAt(offset + (d0 = x))
        bx1 = b.charCodeAt(offset + (d1 = x + 1))
        bx2 = b.charCodeAt(offset + (d2 = x + 2))
        bx3 = b.charCodeAt(offset + (d3 = x + 3))
        dd = (x += 4)
        for (y = 0; y < len; y += 2) {
            dy = vector[y]
            ay = vector[y + 1]
            d0 = _min(dy, d0, d1, bx0, ay)
            d1 = _min(d0, d1, d2, bx1, ay)
            d2 = _min(d1, d2, d3, bx2, ay)
            dd = _min(d2, d3, dd, bx3, ay)
            vector[y] = dd
            d3 = d2
            d2 = d1
            d1 = d0
            d0 = dy
        }
    }

    for (; x < lb;) {
        bx0 = b.charCodeAt(offset + (d0 = x))
        dd = ++x
        for (y = 0; y < len; y += 2) {
            dy = vector[y]
            vector[y] = dd = _min(dy, d0, dd, bx0, vector[y + 1])
            d0 = dy
        }
    }

    return dd
}