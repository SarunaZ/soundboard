#!/bin/sh
# Test-only substitute for yt-dlp. It never contacts YouTube or another host.
set -eu

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
    printf '%s\n' '{"duration":3,"title":"Test sine fixture","is_live":false}'
    exit 0
    ;;
esac

case " $* " in
  *cancel12345*)
    printf 'partial' > source.partial
    sleep 30
    exit 1
    ;;
  *retry_12345*)
    if [ ! -f .retry-used ]; then
      touch .retry-used
      printf 'partial' > source.m4a
      exit 1
    fi
    ;;
esac

if [ -z "$output_template" ]; then exit 2; fi
output_path=$(printf '%s' "$output_template" | sed 's/%(ext)s/m4a/')
exec ffmpeg -nostdin -v error -f lavfi -i 'sine=frequency=440:duration=3' -vn -ac 1 -ar 44100 -c:a aac -b:a 96k -y "$output_path"
