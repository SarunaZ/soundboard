# Android FFmpeg 8.0.3 build

`build-android.sh` builds local-media FFmpeg libraries from the fixed FFmpeg
8.0.3 release archive. Run it inside the repository's Android toolchain
container with `ANDROID_NDK_HOME` set to NDK 27.1.12297006. It downloads only
the official source archive, its PGP signature, and FFmpeg's public signing
key. It checks a pinned SHA-256 and requires the full release-key fingerprint
before extracting source.

```sh
ANDROID_NDK_HOME=/opt/android-sdk/ndk/27.1.12297006 \
  /w/scripts/native-ffmpeg/build-android.sh \
  --output-root /tmp/soundboard-ffmpeg-8.0.3
```

Output contains `jniLibs/<abi>/lib{avcodec,avformat,avutil,swresample}.so`,
`probes/<abi>/ffmpeg_decode_probe`, `provenance.json`, `SHA256SUMS`, source
verification/configure logs, and the LGPL license. The probe takes one or more
local audio paths, prints the loaded FFmpeg version, then decodes each file and
reports codec, rate, channel count, decoded frames/samples, and normalized PCM
peak. To install validated output into a staged React
Native package, pass `--install-root /path/to/react-native-audio-api/android/src/main/jniLibs`.
The default ABI set is `arm64-v8a,x86_64`; `armeabi-v7a,x86` are optional.

Configuration follows the reviewed `rn-audio-libs` audio feature set with
Play's local-only scope: network and OpenSSL are disabled, and only the `file`
protocol is enabled. Audio AAC, MP3, FLAC, ALAC and PCM decode is retained,
along with local AAC, MOV/MP4, MP3, FLAC, CAF and WAV demux, and the
reviewed audio encoders/muxers. Video decoders, filters, devices and additional
network/TLS libraries are disabled. Shared objects target Android API 24 and
request 16 KB maximum/common page-size linker alignment. GPL components and
external codec libraries are disabled. The source is LGPL-2.1-or-later.

The script does not modify the host checkout unless an install root is passed.
Preserve the source archive, signature status/configure logs and provenance
with release evidence.
