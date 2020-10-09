#!/bin/sh

for file in $(find target -name '*.js'); do
    sed -i \
        -e 's#export function#function#g' \
        -e 's#export var#var#g' \
        -e 's#export const#var#g' \
        -e 's#Object.defineProperty(exports, "__esModule", { value: true });#var exports = {};#g' \
        "${file}"
    sed -i -E 's/export class (\w+)/var \1 = class \1/g' "${file}"
    sed -i -E "s/import \* as (\w+) from '(\w+)'/const \1 = Me.imports.\2/g" "${file}"
done