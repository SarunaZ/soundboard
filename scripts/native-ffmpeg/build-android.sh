#!/usr/bin/env bash
set -euo pipefail
VERSION=8.0.3
TARBALL=ffmpeg-${VERSION}.tar.xz
URL=https://ffmpeg.org/releases/${TARBALL}
SOURCE_SHA256=6136812ea6d4e68bdba27e33c2a94382711cdf4f8602ffef056ff792bd6f9818
SIGNING_FINGERPRINT=FCF986EA15E6E293A5644F10B4322F04D67658D8
NDK_VERSION=27.1.12297006
API=24
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
usage() { echo 'Usage: build-android.sh --output-root DIR [--install-root JNI_LIBS_DIR] [--abis arm64-v8a,x86_64[,armeabi-v7a,x86]]'; }
OUT= INSTALL_ROOT= ABIS=arm64-v8a,x86_64
while (($#)); do
  case "$1" in
    --output-root) OUT=${2:?missing output root}; shift 2 ;;
    --install-root) INSTALL_ROOT=${2:?missing install root}; shift 2 ;;
    --abis) ABIS=${2:?missing ABI list}; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done
[[ -n "$OUT" ]] || { usage >&2; exit 2; }
for tool in curl sha256sum gpg xz make tar; do command -v "$tool" >/dev/null || { echo "Missing tool: $tool" >&2; exit 2; }; done
[[ -n "${ANDROID_NDK_HOME:-}" && -d "$ANDROID_NDK_HOME" ]] || { echo 'ANDROID_NDK_HOME must point to the installed Android NDK.' >&2; exit 2; }
[[ "$(basename "$ANDROID_NDK_HOME")" == "$NDK_VERSION" ]] || { echo "Expected NDK $NDK_VERSION, got $ANDROID_NDK_HOME" >&2; exit 2; }
OUT=$(mkdir -p "$OUT" && cd "$OUT" && pwd)
WORK="${TMPDIR:-/tmp}/soundboard-ffmpeg-${VERSION}-$$"; mkdir -p "$WORK/src" "$WORK/build" "$OUT/jniLibs"
IFS=, read -r -a ABI_LIST <<< "$ABIS"
for abi in "${ABI_LIST[@]}"; do case "$abi" in arm64-v8a|x86_64|armeabi-v7a|x86) ;; *) echo "Unsupported Android ABI: $abi" >&2; exit 2 ;; esac; done
if [[ ! -f "$WORK/src/$TARBALL" ]]; then curl --fail --location --retry 3 "$URL" -o "$WORK/src/$TARBALL"; fi
printf '%s  %s\n' "$SOURCE_SHA256" "$WORK/src/$TARBALL" | sha256sum --check --status || { echo "FFmpeg source SHA-256 mismatch for $TARBALL" >&2; exit 1; }
curl --fail --location --retry 3 "${URL}.asc" -o "$WORK/src/${TARBALL}.asc"
GNUPGHOME="$WORK/gnupg"; export GNUPGHOME; mkdir -m 700 -p "$GNUPGHOME"
curl --fail --location --retry 3 https://ffmpeg.org/ffmpeg-devel.asc -o "$WORK/src/ffmpeg-devel.asc"
gpg --batch --import "$WORK/src/ffmpeg-devel.asc" >/dev/null 2>&1
gpg --batch --status-fd 1 --verify "$WORK/src/${TARBALL}.asc" "$WORK/src/$TARBALL" > "$WORK/signature-status.txt" 2> "$WORK/signature.log"
grep -F "VALIDSIG $SIGNING_FINGERPRINT" "$WORK/signature-status.txt" >/dev/null || { echo 'FFmpeg signature did not match pinned release key.' >&2; exit 1; }
SOURCE_DIR="$WORK/source-base/ffmpeg-$VERSION"
mkdir -p "$WORK/source-base"
tar -xJf "$WORK/src/$TARBALL" -C "$WORK/source-base"
[[ -f "$SOURCE_DIR/RELEASE" && "$(tr -d '\r\n' < "$SOURCE_DIR/RELEASE")" == "$VERSION" ]] || { echo 'Extracted FFmpeg RELEASE marker mismatch.' >&2; exit 1; }
NDK_BIN="$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/linux-x86_64/bin"
[[ -x "$NDK_BIN/clang" && -x "$NDK_BIN/llvm-ar" ]] || { echo 'NDK Linux LLVM toolchain unavailable.' >&2; exit 2; }
HOST_CC=${HOST_CC:-clang}; command -v "$HOST_CC" >/dev/null || { echo "Host compiler $HOST_CC unavailable." >&2; exit 2; }
BUILD_TRIPLET=$($HOST_CC -dumpmachine)
config_flags=(--prefix=/unused --target-os=android --enable-cross-compile --disable-programs --disable-doc --disable-avdevice --disable-swscale --disable-avfilter --disable-network --disable-openssl --disable-static --enable-shared --enable-small --enable-pic --disable-debug --disable-everything --disable-autodetect --disable-x86asm --disable-inline-asm --disable-symver --enable-protocol=file --enable-demuxer=aac,mov,mp3,flac,caf,wav --enable-parser=aac --enable-decoder=aac,mp3,flac,alac,pcm_s16le,pcm_s24le,pcm_s32le,pcm_f32le,pcm_f32be,pcm_s16be --enable-encoder=aac,mp3,flac,pcm_s16le --enable-muxer=wav,mp4,flac,caf)
for abi in "${ABI_LIST[@]}"; do
  case "$abi" in
    arm64-v8a) triple=aarch64-linux-android; arch=aarch64; cpu=armv8-a; expected_machine='AArch64'; expected_class=ELF64 ;;
    x86_64) triple=x86_64-linux-android; arch=x86_64; cpu=x86-64; expected_machine='X86-64'; expected_class=ELF64 ;;
    armeabi-v7a) triple=armv7a-linux-androideabi; arch=arm; cpu=armv7-a; expected_machine='ARM'; expected_class=ELF32 ;;
    x86) triple=i686-linux-android; arch=x86; cpu=i686; expected_machine='80386'; expected_class=ELF32 ;;
  esac
  build="$WORK/build/$abi"; SRC="$WORK/src-build/$abi/ffmpeg"
  mkdir -p "$(dirname "$SRC")" "$build"
  rm -rf "$SRC"
  cp -a "$SOURCE_DIR" "$SRC"
  pushd "$SRC" >/dev/null
  env CC="$NDK_BIN/${triple}${API}-clang" CXX="$NDK_BIN/${triple}${API}-clang++" AR="$NDK_BIN/llvm-ar" RANLIB="$NDK_BIN/llvm-ranlib" STRIP="$NDK_BIN/llvm-strip" NM="$NDK_BIN/llvm-nm" ./configure --arch="$arch" --cpu="$cpu" --host-cc="$HOST_CC" --cc="$NDK_BIN/${triple}${API}-clang" --cxx="$NDK_BIN/${triple}${API}-clang++" --ar="$NDK_BIN/llvm-ar" --ranlib="$NDK_BIN/llvm-ranlib" --strip="$NDK_BIN/llvm-strip" --nm="$NDK_BIN/llvm-nm" --cross-prefix="$NDK_BIN/$triple-" --sysroot="$NDK_BIN/../sysroot" --extra-cflags='-O2 -fPIC' --extra-ldflags='-Wl,-z,max-page-size=16384,-z,common-page-size=16384' --disable-x86asm --disable-inline-asm --extra-version=soundboard-android-8.0.3 "${config_flags[@]}" > "$build/configure.log" 2>&1
  cp config.h "$build/config.h"
  grep -Rqs '^#define CONFIG_FILE_PROTOCOL 1$' --include='config*.h' . || { echo "file protocol not enabled for $abi" >&2; exit 1; }
  if grep -REq '^#define CONFIG_(HTTP|HTTPS|TCP|TLS|OPENSSL)_PROTOCOL 1$' --include='config*.h' .; then echo "network/TLS protocol unexpectedly enabled for $abi" >&2; exit 1; fi
  make -j"${JOBS:-$(nproc)}" V=1 > "$build/make.log" 2>&1
  rm -rf "$build/stage"
  make install-libs install-headers DESTDIR="$build/stage" > "$build/install.log" 2>&1
  popd >/dev/null
  mkdir -p "$OUT/build-logs/$abi"
  cp "$build/configure.log" "$build/make.log" "$build/install.log" "$build/config.h" "$OUT/build-logs/$abi/"
  dest="$OUT/jniLibs/$abi"; mkdir -p "$dest"
  for lib in avcodec avformat avutil swresample; do
    src="$build/stage/unused/lib/lib$lib.so"; [[ -f "$src" ]] || { echo "Missing library $src" >&2; exit 1; }
    "$NDK_BIN/llvm-strip" --strip-unneeded "$src"; cp "$src" "$dest/"
    elf_header=$("$NDK_BIN/llvm-readelf" -h "$dest/lib$lib.so")
    grep -q 'DYN (Shared object file)' <<< "$elf_header" || { echo "$dest/lib$lib.so not ELF shared library" >&2; exit 1; }
    grep -Eq "Class:[[:space:]]+$expected_class" <<< "$elf_header" || { echo "$dest/lib$lib.so has unexpected ELF class for $abi" >&2; exit 1; }
    grep -Eq "Machine:.*$expected_machine" <<< "$elf_header" || { echo "$dest/lib$lib.so has unexpected ELF machine for $abi" >&2; exit 1; }
    load_count=0
    while read -r align; do
      ((load_count += 1))
      alignment=$((16#${align#0x}))
      (( alignment >= 16384 )) || { echo "$dest/lib$lib.so has LOAD alignment $align, below 16 KB" >&2; exit 1; }
    done < <("$NDK_BIN/llvm-readelf" -lW "$dest/lib$lib.so" | awk '$1 == "LOAD" { print $NF }')
    (( load_count > 0 )) || { echo "$dest/lib$lib.so has no LOAD segments" >&2; exit 1; }
  done
  probe_dir="$OUT/probes/$abi"; mkdir -p "$probe_dir"
  if ! "$NDK_BIN/${triple}${API}-clang" -O2 -fPIE -pie -I"$build/stage/unused/include" -Wl,-z,max-page-size=16384,-z,common-page-size=16384 -L"$dest" -Wl,-rpath-link,"$dest" "$REPO_ROOT/scripts/native-tests/ffmpeg_decode_probe.c" -lavformat -lavcodec -lswresample -lavutil -lm -o "$probe_dir/ffmpeg_decode_probe" > "$build/probe.log" 2>&1; then
    cp "$build/probe.log" "$OUT/build-logs/$abi/"
    cat "$build/probe.log" >&2
    exit 1
  fi
  cp "$build/probe.log" "$OUT/build-logs/$abi/"
done
allowed_needed='libavcodec.so|libavformat.so|libavutil.so|libswresample.so|libc.so|libm.so|libdl.so|liblog.so|libandroid.so'
for so in "$OUT"/jniLibs/*/*.so; do
  while read -r needed; do
    [[ -z "$needed" ]] && continue
    grep -Eq "^($allowed_needed)$" <<< "$needed" || { echo "Unexpected DT_NEEDED $needed in $so" >&2; exit 1; }
  done < <("$NDK_BIN/llvm-readelf" -d "$so" | sed -n 's/.*Shared library: \[\([^]]*\)\].*/\1/p')
done
cp "$SOURCE_DIR/COPYING.LGPLv2.1" "$OUT/LICENSE"
mkdir -p "$OUT/source-evidence"
cp "$WORK/src/$TARBALL" "$WORK/src/${TARBALL}.asc" "$WORK/src/ffmpeg-devel.asc" "$WORK/signature-status.txt" "$WORK/signature.log" "$OUT/source-evidence/"
cat > "$OUT/provenance.json" <<EOF
{
  "ffmpeg_version": "$VERSION",
  "source_url": "$URL",
  "source_sha256": "$SOURCE_SHA256",
  "signature_key_fingerprint": "$SIGNING_FINGERPRINT",
  "ndk_version": "$NDK_VERSION",
  "android_api": $API,
  "host_compiler": "$($HOST_CC --version | head -n 1)",
  "build_triplet": "$BUILD_TRIPLET",
  "abis": [$(printf '"%s",' "${ABI_LIST[@]}" | sed 's/,$//')],
  "configure_flags": [$(printf '"%s",' "${config_flags[@]}" | sed 's/,$//')],
  "linker_flags": "-Wl,-z,max-page-size=16384,-z,common-page-size=16384",
  "network_protocols": "disabled; only file protocol",
  "elf_validation": "ABI class/machine and all PT_LOAD alignment >= 16384 validated",
  "runtime_dependencies": "DT_NEEDED checked against bundled FFmpeg and Android system libraries",
  "libraries": ["libavcodec.so", "libavformat.so", "libavutil.so", "libswresample.so"],
  "license": "LGPL-2.1-or-later"
}
EOF
(cd "$OUT" && find jniLibs probes -type f \( -name '*.so' -o -name 'ffmpeg_decode_probe' \) -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS)
if [[ -n "$INSTALL_ROOT" ]]; then mkdir -p "$INSTALL_ROOT"; cp -a "$OUT/jniLibs/." "$INSTALL_ROOT/"; fi
echo "FFmpeg $VERSION built for ${ABI_LIST[*]} under $OUT"
