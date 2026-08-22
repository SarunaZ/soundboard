#!/usr/bin/env bash
# Soundboard task runner. Docker is the only prerequisite — no Node, no
# corepack, no Yarn, no JDK, no Android SDK on this machine.
#
#   ./sb.sh <command>
#
# The PowerShell twin is sb.ps1. Both are thin wrappers over docker compose;
# nothing here is clever, so `docker compose ...` by hand always works too.

set -euo pipefail
cd "$(dirname "$0")"

APK="app-client/android/app/build/outputs/apk/debug/app-debug.apk"

show_apk() {
  if [ -f "$APK" ]; then
    printf '\nOK  %s  (%s MB)\n' "$APK" "$(du -m "$APK" | cut -f1)"
  else
    echo "Build reported success but no APK at $APK" >&2
    exit 1
  fi
}

help() {
  cat <<'EOF'
Soundboard — Docker-only task runner

  build          EVERYTHING: dependencies, service image, APK
  install        Install node_modules inside Linux, into the working tree
  apk            Build the debug APK (installs deps first if missing)
                   --all-abis   build all four ABIs, for an x86_64 emulator
                   --clean      gradle clean first
  metro          Start the Metro dev server (needs LAN_IP in .env)
  shell          Bash shell inside the Android toolchain container

  service:up     Build and start the api + worker containers
  service:down   Stop them
  service:logs   Follow their logs
  service:health Print the API's /health

  doctor         Check that Docker is present and the images exist

Everything runs in a container. The first `apk` build takes ~9 min; later ones
about a minute, because Gradle's cache lives in a named volume.
EOF
}

cmd="${1:-help}"
shift || true

case "$cmd" in
  install)
    docker compose --profile tools run --rm deps
    ;;

  apk)
    for arg in "$@"; do
      case "$arg" in
        --all-abis) export ABIS='armeabi-v7a,arm64-v8a,x86,x86_64'; echo '→ building all four ABIs' ;;
        --clean)    GRADLE_TASK=clean docker compose --profile android run --rm apk ;;
      esac
    done
    docker compose --profile android run --rm apk
    show_apk
    echo "Copy it to the phone and tap it to install, then: ./sb.sh metro"
    ;;

  # Everything: dependencies, both service images, and the APK.
  build)
    echo "== 1/3  dependencies =="
    docker compose --profile tools run --rm deps
    echo
    echo "== 2/3  service image (api + worker) =="
    docker compose build
    echo
    echo "== 3/3  android apk =="
    docker compose --profile android run --rm apk
    show_apk
    echo
    echo "All built. Next: ./sb.sh service:up   and   ./sb.sh metro"
    ;;

  metro)
    if ! grep -qE '^LAN_IP=\S' .env 2>/dev/null; then
      echo "LAN_IP is not set in .env — the phone would be handed a container IP it cannot reach." >&2
      exit 1
    fi
    docker compose --profile tools up metro
    ;;

  shell)
    docker compose --profile android run --rm --entrypoint bash apk
    ;;

  service:up)     docker compose up --build -d ;;
  service:down)   docker compose down ;;
  service:logs)   docker compose logs -f ;;
  service:health) docker compose exec api curl -fsS http://127.0.0.1:8080/health ;;

  doctor)
    docker --version
    docker compose version --short
    echo
    echo "Images:"
    docker images --format '  {{.Repository}}:{{.Tag}}  {{.Size}}' | grep -E 'soundboard|node:24' || true
    echo
    echo "node_modules present: $([ -d node_modules ] && echo yes || echo no)"
    echo ".env present:          $([ -f .env ] && echo yes || echo no)"
    ;;

  *) help ;;
esac
