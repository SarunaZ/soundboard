#!/bin/sh
# Deterministic local source fixture. This never contacts YouTube or another host.
set -eu

if [ "${1:-}" = "--version" ]; then
  printf '%s\n' 'fixture-yt-dlp 1.0'
  exit 0
fi

output_template=
previous=
for arg in "$@"; do
  if [ "$previous" = output ]; then
    output_template=$arg
    previous=
    continue
  fi
  if [ "$arg" = "-o" ]; then previous=output; fi
done

case " $* " in
  *" --dump-single-json "*)
    case " $* " in
      *bC_dE-1199x*) printf '%s\n' '{"duration":1199,"title":"Synthetic 1199 second fixture","is_live":false}' ;;
      *exact32MiB*) printf '%s\n' '{"duration":3,"title":"Synthetic exact 32 MiB WAV fixture","is_live":false}' ;;
      *over32MiB*) printf '%s\n' '{"duration":3,"title":"Synthetic over 32 MiB WAV fixture","is_live":false}' ;;
      *) printf '%s\n' '{"duration":3,"title":"Synthetic 3 second fixture","is_live":false}' ;;
    esac
    exit 0
    ;;
esac

if [ -z "$output_template" ]; then exit 2; fi
case " $* " in
  *exact32MiB*|*over32MiB*) output_path=$(printf '%s' "$output_template" | sed 's/%(ext)s/wav/') ;;
  *) output_path=$(printf '%s' "$output_template" | sed 's/%(ext)s/m4a/') ;;
esac
case " $* " in
  *bC_dE-1199x*) duration=1199 ;;
  *) duration=3 ;;
esac

case " $* " in
  *exact32MiB*|*over32MiB*)
    ffmpeg -nostdin -v error -f lavfi -i "sine=frequency=440:sample_rate=44100:duration=$duration" \
      -vn -ac 1 -ar 44100 -c:a pcm_s16le -y "$output_path"
    target_bytes=33554432
    case " $* " in *over32MiB*) target_bytes=33554433 ;; esac
    truncate -s "$target_bytes" "$output_path"
    exit 0
    ;;
esac

# Generate real AAC to disk. The near-limit fixture is intentionally 1199 s:
# AAC container duration rounding would put an exact 1200 s file over the cap.
ffmpeg -nostdin -v error -f lavfi -i "sine=frequency=440:sample_rate=44100:duration=$duration" \
  -vn -ac 1 -ar 44100 -c:a aac -b:a 96k -y "$output_path"
bytes=$(wc -c < "$output_path")
if [ "$bytes" -gt 33554432 ]; then
  rm -f "$output_path"
  echo 'fixture source exceeded 32 MiB' >&2
  exit 3
fi
