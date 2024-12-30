#!/bin/sh
# Set app version in resource reference URLs. App version is primarly used for
# cache-busting purposes in conjunction with service worker.

set -eu

current_V=$(sed -nE "s/^ *const *V *= *'([0-9]+)' *;.*/\1/p" serviceworker.js|head -n 1)
next_V=$((${1:-${current_V} + 1}))

for file in *.html *.js app.webmanifest; do
    sed -E -i -e "s/\?_V=[0-9]+/?_V=${next_V}/g" \
              -e "s/V *= *'[0-9]+';/V = '${next_V}';/" "$file"
done
