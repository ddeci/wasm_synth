#!/usr/bin/env bash
set -e
wasm-pack build --target web
echo ""
echo "Serving at http://localhost:8080"
miniserve www/ --index index.html \
  --header 'Cross-Origin-Opener-Policy: same-origin' \
  --header 'Cross-Origin-Embedder-Policy: require-corp' \
  -p 8080
