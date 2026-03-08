#!/usr/bin/env bash
set -e
wasm-pack build --target web
ln -sfn ../pkg www/pkg
echo "Build done — just refresh the browser"
