#!/bin/sh
set -ex

pwd=$(pwd)

# In goes standard JS. Out comes GJS-compatible JS
transpile() {
    cat ${src} | sed -e 's#export function#function#g' \
        -e 's#export var#var#g' \
        -e 's#export const#var#g' \
        -e 's#Object.defineProperty(exports, "__esModule", { value: true });#var exports = {};#g' \
        | sed -E 's/export class (\w+)/var \1 = class \1/g' \
        | sed -E "s/import \* as (\w+) from '(\w+)'/const \1 = Me.imports.\2/g" > ${dest}
}

rm -rf _build

glib-compile-schemas schemas &

# Transpile to JavaScript

for proj in ${PROJECTS}; do
    mkdir -p _build/${proj}
    tsc --p src/${proj}
done

tsc

wait

# Convert JS to GJS-compatible scripts

cp -r metadata.json icons schemas *.css _build &

for src in $(find target -name '*.js'); do
    dest=$(echo $src | sed s#target#_build#g)
    transpile
done

wait