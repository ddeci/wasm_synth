#!/usr/bin/env bash
set -e
wasm-pack build --target web
echo "Build done — just refresh the browser"
