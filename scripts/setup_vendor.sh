#!/bin/bash
# Regenera vendor/ (MediaPipe + el modelo de deteccion de cara).
# vendor/ pesa ~38 MB y esta gitignoreado: esto lo reconstruye desde cero.
set -e
cd "$(dirname "$0")/.."

echo "1/3 dependencias…"
npm install --cache "${TMPDIR:-/tmp}/npmcache" @mediapipe/tasks-vision@1.0.1

echo "2/3 copiando el bundle y el wasm…"
mkdir -p vendor/tasks-vision vendor/models
cp node_modules/@mediapipe/tasks-vision/vision_bundle.mjs vendor/tasks-vision/
rm -rf vendor/tasks-vision/wasm
cp -r node_modules/@mediapipe/tasks-vision/wasm vendor/tasks-vision/wasm

echo "3/3 bajando face_landmarker.task (3,7 MB)…"
curl -sS -L -o vendor/models/face_landmarker.task \
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"

SIZE=$(wc -c < vendor/models/face_landmarker.task)
if [ "$SIZE" -lt 3000000 ]; then echo "ERROR: el modelo bajo incompleto ($SIZE bytes)"; exit 1; fi
echo "Listo. vendor/ reconstruido ($(du -sh vendor | cut -f1))."
