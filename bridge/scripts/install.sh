#!/bin/sh
# Install claw-remote on Linux or macOS.
#
# Usage:
#   ./install.sh --tarball PATH                  # local file
#   ./install.sh --tarball URL                   # https/http URL
#   ./install.sh --prefix DIR                    # install root (default ~/.local/claw-remote)
#   ./install.sh --bin DIR                       # symlink dir (default ~/.local/bin)
#   ./install.sh --systemd                       # write a systemd --user unit (Linux)
#   ./install.sh --launchd                       # write a launchd plist (macOS)
#   ./install.sh --bridge-port 7778 --http-port 7779
#   ./install.sh --no-start                      # do not enable+start the unit
#   ./install.sh --uninstall                     # remove unit + symlink + prefix
#
# Environment: NODE (path to node binary), CLAW_REMOTE_NAME (display name).
set -eu

tarball=""
prefix="${HOME}/.local/claw-remote"
bin_dir="${HOME}/.local/bin"
install_systemd=0
install_launchd=0
bridge_port=7778
http_port=7779
bind_addr=""
do_uninstall=0
start_service=1

while [ $# -gt 0 ]; do
  case "$1" in
    --tarball) tarball="$2"; shift 2;;
    --prefix) prefix="$2"; shift 2;;
    --bin) bin_dir="$2"; shift 2;;
    --systemd) install_systemd=1; shift;;
    --launchd) install_launchd=1; shift;;
    --bridge-port) bridge_port="$2"; shift 2;;
    --http-port) http_port="$2"; shift 2;;
    --bind) bind_addr="$2"; shift 2;;
    --uninstall) do_uninstall=1; shift;;
    --no-start) start_service=0; shift;;
    -h|--help)
      grep '^# ' "$0" | sed 's/^# //'
      exit 0;;
    *) echo "unknown arg: $1" >&2; exit 1;;
  esac
done

uname_s="$(uname -s)"
case "$uname_s" in
  Linux) host_os="linux";;
  Darwin) host_os="darwin";;
  MINGW*|MSYS*|CYGWIN*) host_os="windows";;
  *) host_os="unknown";;
esac

uname_m="$(uname -m)"
case "$uname_m" in
  x86_64|amd64) host_arch="x64";;
  aarch64|arm64) host_arch="arm64";;
  *) host_arch="$uname_m";;
esac

if [ "$do_uninstall" -eq 1 ]; then
  echo "[install] uninstalling claw-remote"
  if [ "$host_os" = "linux" ]; then
    if command -v systemctl >/dev/null 2>&1; then
      systemctl --user disable --now claw-remote.service 2>/dev/null || true
    fi
    rm -f "${HOME}/.config/systemd/user/claw-remote.service"
  fi
  if [ "$host_os" = "darwin" ]; then
    launchctl unload "${HOME}/Library/LaunchAgents/com.claw.remote.plist" 2>/dev/null || true
    rm -f "${HOME}/Library/LaunchAgents/com.claw.remote.plist"
  fi
  rm -f "$bin_dir/claw-remote"
  rm -rf "$prefix"
  echo "[install] uninstalled"
  exit 0
fi

if [ -z "$tarball" ]; then
  echo "missing --tarball <path-or-url>" >&2
  exit 1
fi

mkdir -p "$prefix" "$bin_dir"

# Download or copy.
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
case "$tarball" in
  http://*|https://*)
    echo "[install] downloading $tarball"
    if command -v curl >/dev/null 2>&1; then
      curl -fsSL -o "$tmpdir/release.tar.gz" "$tarball"
    elif command -v wget >/dev/null 2>&1; then
      wget -q -O "$tmpdir/release.tar.gz" "$tarball"
    else
      echo "need curl or wget to download" >&2
      exit 1
    fi
    src="$tmpdir/release.tar.gz"
    ;;
  *)
    if [ ! -f "$tarball" ]; then
      echo "tarball not found: $tarball" >&2
      exit 1
    fi
    src="$tarball"
    ;;
esac

echo "[install] extracting into $prefix"
tar -xzf "$src" -C "$tmpdir"
entry="$(ls -d "$tmpdir"/claw-remote-* 2>/dev/null | head -1)"
if [ -z "$entry" ]; then
  echo "tarball did not contain claw-remote-*/ entry" >&2
  exit 1
fi

rm -rf "$prefix.tmp"
mv "$entry" "$prefix.tmp"
rm -rf "$prefix.prev"
[ -e "$prefix" ] && mv "$prefix" "$prefix.prev" || true
mv "$prefix.tmp" "$prefix"
rm -rf "$prefix.prev"

ln -sf "$prefix/bin/claw-remote" "$bin_dir/claw-remote"
chmod +x "$prefix/bin/claw-remote"
echo "[install] installed to $prefix, symlink at $bin_dir/claw-remote"

write_systemd_unit() {
  unit_dir="${HOME}/.config/systemd/user"
  mkdir -p "$unit_dir"
  unit_path="$unit_dir/claw-remote.service"
  cat > "$unit_path" <<EOF
[Unit]
Description=Claw Remote (claw-remote)
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=$prefix/bin/claw-remote
Environment=CLAW_REMOTE_PORT=$bridge_port
Environment=CLAW_REMOTE_HTTP_PORT=$http_port
EOF
  if [ -n "$bind_addr" ]; then
    echo "Environment=CLAW_REMOTE_BIND=$bind_addr" >> "$unit_path"
  fi
  cat >> "$unit_path" <<'EOF'
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
EOF
  if command -v systemctl >/dev/null 2>&1; then
    systemctl --user daemon-reload
    if [ "$start_service" -eq 1 ]; then
      systemctl --user enable --now claw-remote.service
    fi
    echo "[install] systemd unit installed at $unit_path"
  else
    echo "[install] systemctl missing; unit at $unit_path won't auto-start"
  fi
}

write_launchd_plist() {
  plist_dir="${HOME}/Library/LaunchAgents"
  mkdir -p "$plist_dir"
  plist_path="$plist_dir/com.claw.remote.plist"
  cat > "$plist_path" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.claw.remote</string>
  <key>ProgramArguments</key>
  <array>
    <string>$prefix/bin/claw-remote</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>EnvironmentVariables</key>
  <dict>
    <key>CLAW_REMOTE_PORT</key>
    <string>$bridge_port</string>
    <key>CLAW_REMOTE_HTTP_PORT</key>
    <string>$http_port</string>
  </dict>
</dict>
</plist>
EOF
  if [ "$start_service" -eq 1 ] && command -v launchctl >/dev/null 2>&1; then
    launchctl unload "$plist_path" 2>/dev/null || true
    launchctl load "$plist_path"
  fi
  echo "[install] launchd plist installed at $plist_path"
}

if [ "$install_systemd" -eq 1 ]; then
  if [ "$host_os" != "linux" ]; then
    echo "--systemd is Linux-only (current host: $host_os)" >&2
    exit 1
  fi
  write_systemd_unit
fi

if [ "$install_launchd" -eq 1 ]; then
  if [ "$host_os" != "darwin" ]; then
    echo "--launchd is macOS-only (current host: $host_os)" >&2
    exit 1
  fi
  write_launchd_plist
fi

echo "[install] done. test it with: $bin_dir/claw-remote --help (or run directly)"
