#!/bin/bash
# Doble clic para abrir el probador. Levanta un servidor local y abre el browser.
# Tiene que ser http://localhost y no un archivo suelto: los browsers solo dan
# permiso de camara en un origen seguro, y localhost cuenta como tal.
cd "$(dirname "$0")" || exit 1

PORT=""
for p in $(seq 8777 8790); do
  if ! nc -z 127.0.0.1 "$p" 2>/dev/null; then PORT=$p; break; fi
done
if [ -z "$PORT" ]; then echo "No encontre un puerto libre entre 8777 y 8790."; read -r; exit 1; fi

echo "Probador de anteojos"
echo "Servidor en http://localhost:$PORT"
echo "Cerra esta ventana (Ctrl+C) cuando termines."
echo

python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null' EXIT INT TERM
sleep 1
open "http://localhost:$PORT/"
wait $SERVER_PID
