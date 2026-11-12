#!/bin/sh
# Install the match server on a shared host without joining other app
# networks, mounting their files, or reading their environment.
set -eu

REPO_URL="${REPO_URL:-https://github.com/Apurva9997/shoot-em-all.git}"
APP_ROOT="${APP_ROOT:-/opt/shoot-em-all}"
IMAGE="${IMAGE:-shoot-em-all:isolated}"
CONTAINER="${CONTAINER:-shoot-em-all}"
CADDY_CONTAINER="${CADDY_CONTAINER:-secret-santa-caddy-1}"
HOST="${PUBLIC_HOST:-13-202-16-144.sslip.io}"
PORT="${PORT:-3091}"
ORIGINS="${GAME_ORIGINS:-https://shoot-em-all-apurva.netlify.app}"

if [ "$(id -u)" -ne 0 ]; then
  echo "run as root" >&2
  exit 1
fi

if ! id shootemall >/dev/null 2>&1; then
  useradd --system --create-home --home-dir /var/lib/shootemall --shell /usr/sbin/nologin shootemall
fi
chmod 700 /var/lib/shootemall

install -d -o shootemall -g shootemall -m 755 "$APP_ROOT"
if [ ! -d "$APP_ROOT/.git" ]; then
  sudo -u shootemall git clone --depth 1 "$REPO_URL" "$APP_ROOT"
else
  sudo -u shootemall git -C "$APP_ROOT" fetch --depth 1 origin main
  sudo -u shootemall git -C "$APP_ROOT" reset --hard origin/main
fi

docker build -t "$IMAGE" "$APP_ROOT"

GATEWAY="$(docker inspect "$CADDY_CONTAINER" --format '{{range .NetworkSettings.Networks}}{{.Gateway}}{{end}}')"
if [ -z "$GATEWAY" ]; then
  echo "caddy container has no gateway" >&2
  exit 1
fi

docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker run -d \
  --name "$CONTAINER" \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --memory 256m \
  --cpus 0.4 \
  --pids-limit 128 \
  --restart unless-stopped \
  -p "${GATEWAY}:${PORT}:${PORT}" \
  -e PORT="$PORT" \
  -e SERVE_STATIC=0 \
  -e "GAME_ORIGINS=${ORIGINS}" \
  "$IMAGE"

CADDYFILE="$(docker inspect "$CADDY_CONTAINER" --format '{{range .Mounts}}{{if eq .Destination "/etc/caddy/Caddyfile"}}{{.Source}}{{end}}{{end}}')"
if [ -z "$CADDYFILE" ] || [ ! -f "$CADDYFILE" ]; then
  echo "caddyfile mount not found" >&2
  exit 1
fi

MARKER="# shoot-em-all-isolated"
BACKUP="${CADDYFILE}.bak-shootemall"
cp "$CADDYFILE" "$BACKUP"
if ! grep -q "$MARKER" "$CADDYFILE"; then
  cat >>"$CADDYFILE" <<EOF

${MARKER}
${HOST} {
	reverse_proxy ${GATEWAY}:${PORT}
}
EOF
fi

if ! docker exec "$CADDY_CONTAINER" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile; then
  cp "$BACKUP" "$CADDYFILE"
  echo "caddy validate failed; restored backup" >&2
  exit 1
fi

docker exec "$CADDY_CONTAINER" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
echo "ready https://${HOST}/health via ${GATEWAY}:${PORT}"
