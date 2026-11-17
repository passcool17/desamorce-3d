#!/bin/sh
# Reconstruit vendor/ à partir des paquets npm (aucun CDN à l'exécution).
# three 0.187.0 (MIT), detect-gpu 5.0.70 (MIT), qrcode-generator 2.0.4 (MIT).
set -e
rm -rf vendor/three-0.187.0 vendor/detect-gpu-*.js vendor/qrcode-*.mjs
cd "$(dirname "$0")/.."
T=$(mktemp -d)
(cd "$T" && npm pack --silent three@0.187.0 detect-gpu@5.0.70 qrcode-generator@2.0.4 >/dev/null && for f in *.tgz; do mkdir "${f%.tgz}" && tar xzf "$f" -C "${f%.tgz}"; done)
TH="$T/three-0.187.0/package"
# three : un seul module ES minifié (build/three.module.js + three.core.js)
echo "export * from '$TH/build/three.module.js';" > "$T/entry.mjs"
npx -y esbuild@0.28.2 "$T/entry.mjs" --bundle --format=esm --minify --legal-comments=inline --outfile=vendor/three-0.187.0/three.module.min.js
# addons utilisés tout de suite (fusion de géométries) ou plus tard (modèle GLB de la bombe)
for f in geometries/RoundedBoxGeometry.js environments/RoomEnvironment.js utils/BufferGeometryUtils.js utils/SkeletonUtils.js utils/WorkerPool.js math/ColorSpaces.js \
         loaders/GLTFLoader.js loaders/KTX2Loader.js libs/ktx-parse.module.js libs/zstddec.module.js \
         libs/meshopt_decoder.module.js libs/basis/basis_transcoder.js libs/basis/basis_transcoder.wasm; do
  mkdir -p "vendor/three-0.187.0/addons/$(dirname $f)"; cp "$TH/examples/jsm/$f" "vendor/three-0.187.0/addons/$f"
done
cp "$TH/LICENSE" vendor/three-0.187.0/LICENSE
cp "$T/detect-gpu-5.0.70/package/dist/detect-gpu.esm.js" vendor/detect-gpu-5.0.70.esm.js
rm -rf detect-gpu-benchmarks && cp -r "$T/detect-gpu-5.0.70/package/dist/benchmarks" detect-gpu-benchmarks
cp "$T/qrcode-generator-2.0.4/package/dist/qrcode.mjs" vendor/qrcode-generator-2.0.4.mjs
rm -rf "$T"
echo "vendor/ prêt"
