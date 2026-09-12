#!/bin/bash
# Rebaja las monturas 3D de terceros (50 MB, fuera de git).
# Las fuentes y licencias estan en assets/models/credits.json.
set -e
cd "$(dirname "$0")/.."
mkdir -p assets/models

echo "Monturas CC-BY-4.0 de bensonruan…"
for n in 01 02 03 04 05 06 07; do
  BASE="https://cdn.jsdelivr.net/gh/bensonruan/Virtual-Glasses-Try-on@master/3dmodel/glasses-$n"
  mkdir -p "assets/models/bensonruan-$n"
  curl -sS -L -o "assets/models/bensonruan-$n/scene.gltf" "$BASE/scene.gltf"
  curl -sS -L -o "assets/models/bensonruan-$n/scene.bin"  "$BASE/scene.bin"
  curl -sS -L -o "assets/models/bensonruan-$n/license.txt" "$BASE/license.txt" || true
  # texturas referenciadas por el gltf
  python3 - "$n" <<'PY'
import json, os, sys, urllib.request
n = sys.argv[1]
d = f"assets/models/bensonruan-{n}"
base = f"https://cdn.jsdelivr.net/gh/bensonruan/Virtual-Glasses-Try-on@master/3dmodel/glasses-{n}"
g = json.load(open(f"{d}/scene.gltf"))
for img in g.get("images", []):
    uri = img.get("uri")
    if not uri or uri.startswith("data:"): continue
    dest = os.path.join(d, uri)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    urllib.request.urlretrieve(f"{base}/{uri}", dest)
    print("   ", uri)
PY
  echo "  glasses-$n ok"
done

echo "Catalogo MIT de BeeAR…"
mkdir -p assets/models/beear
RAW="https://raw.githubusercontent.com/mergeos-bounties/BeeAR/master/packages/catalog/glb"
for f in glasses_meshy_studio.glb glasses_meshy_ellipse.glb; do
  curl -sS -L -o "assets/models/beear/$f" "$RAW/$f"
done
curl -sS -L -o assets/models/beear/LICENSE.txt \
  "https://raw.githubusercontent.com/mergeos-bounties/BeeAR/master/LICENSE" || true

echo
echo "Verificando…"
FAIL=0
python3 - <<'PY'
import json, os, sys
frames = json.load(open("assets/models/frames3d.json"))["frames"]
bad = [f["path"] for f in frames if not os.path.exists(f["path"]) or os.path.getsize(f["path"]) < 1024]
if bad:
    print("FALTAN o estan vacios:"); [print("  ", b) for b in bad]; sys.exit(1)
print(f"{len(frames)} monturas presentes.")
PY
echo "Listo. $(du -sh assets/models | cut -f1) en assets/models/."
