#include <errno.h>
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <libavcodec/avcodec.h>
#include <libavformat/avformat.h>
#include <libavutil/error.h>
#include <libavutil/samplefmt.h>

static double peak_for_frame(const AVFrame *frame) {
  enum AVSampleFormat fmt = (enum AVSampleFormat)frame->format;
  int planar = av_sample_fmt_is_planar(fmt);
  enum AVSampleFormat packed = planar ? av_get_packed_sample_fmt(fmt) : fmt;
  int channels = frame->ch_layout.nb_channels;
  int planes = planar ? channels : 1;
  int count = planar ? frame->nb_samples : frame->nb_samples * channels;
  double peak = 0.0;
  for (int p = 0; p < planes; ++p) {
    for (int i = 0; i < count; ++i) {
      double value;
      switch (packed) {
        case AV_SAMPLE_FMT_U8: value = ((const uint8_t *)frame->extended_data[p])[i] / 128.0 - 1.0; break;
        case AV_SAMPLE_FMT_S16: value = ((const int16_t *)frame->extended_data[p])[i] / 32768.0; break;
        case AV_SAMPLE_FMT_S32: value = ((const int32_t *)frame->extended_data[p])[i] / 2147483648.0; break;
        case AV_SAMPLE_FMT_S64: value = (double)((const int64_t *)frame->extended_data[p])[i] / 9223372036854775808.0; break;
        case AV_SAMPLE_FMT_FLT: value = ((const float *)frame->extended_data[p])[i]; break;
        case AV_SAMPLE_FMT_DBL: value = ((const double *)frame->extended_data[p])[i]; break;
        default: return -1.0;
      }
      if (fabs(value) > peak) peak = fabs(value);
    }
  }
  return peak;
}

static int drain(AVCodecContext *decoder, AVFrame *frame, uint64_t *samples,
                 uint64_t *frames, double *peak) {
  int ret;
  while ((ret = avcodec_receive_frame(decoder, frame)) >= 0) {
    ++*frames;
    *samples += (uint64_t)frame->nb_samples;
    double frame_peak = peak_for_frame(frame);
    if (frame_peak < 0.0) return AVERROR(ENOSYS);
    if (frame_peak > *peak) *peak = frame_peak;
    av_frame_unref(frame);
  }
  return ret == AVERROR(EAGAIN) || ret == AVERROR_EOF ? 0 : ret;
}

static int decode_file(const char *path) {
  AVFormatContext *format = NULL;
  AVCodecContext *decoder = NULL;
  AVPacket *packet = NULL;
  AVFrame *frame = NULL;
  const AVCodec *codec = NULL;
  int stream_index = -1;
  int ret = avformat_open_input(&format, path, NULL, NULL);
  uint64_t samples = 0, frames = 0;
  double peak = 0.0;
  if (ret < 0) goto done;
  ret = avformat_find_stream_info(format, NULL);
  if (ret < 0) goto done;
  stream_index = av_find_best_stream(format, AVMEDIA_TYPE_AUDIO, -1, -1, &codec, 0);
  if (stream_index < 0) { ret = stream_index; goto done; }
  decoder = avcodec_alloc_context3(codec);
  if (!decoder) { ret = AVERROR(ENOMEM); goto done; }
  ret = avcodec_parameters_to_context(decoder, format->streams[stream_index]->codecpar);
  if (ret < 0) goto done;
  ret = avcodec_open2(decoder, codec, NULL);
  if (ret < 0) goto done;
  packet = av_packet_alloc(); frame = av_frame_alloc();
  if (!packet || !frame) { ret = AVERROR(ENOMEM); goto done; }
  while ((ret = av_read_frame(format, packet)) >= 0) {
    if (packet->stream_index == stream_index) {
      ret = avcodec_send_packet(decoder, packet);
      if (ret >= 0) ret = drain(decoder, frame, &samples, &frames, &peak);
      if (ret < 0) { av_packet_unref(packet); goto done; }
    }
    av_packet_unref(packet);
  }
  if (ret != AVERROR_EOF) goto done;
  ret = avcodec_send_packet(decoder, NULL);
  if (ret >= 0 || ret == AVERROR_EOF) ret = drain(decoder, frame, &samples, &frames, &peak);
  if (ret >= 0) {
    printf("{\"file\":\"%s\",\"codec\":\"%s\",\"sample_rate\":%d,\"channels\":%d,\"frames\":%llu,\"samples\":%llu,\"peak\":%.9f}\n",
           path, codec->name, decoder->sample_rate, decoder->ch_layout.nb_channels,
           (unsigned long long)frames, (unsigned long long)samples, peak);
  }
done:
  if (ret < 0) fprintf(stderr, "decode failed: %s: %s (%d)\n", path, av_err2str(ret), ret);
  av_frame_free(&frame); av_packet_free(&packet); avcodec_free_context(&decoder);
  avformat_close_input(&format);
  return ret < 0 ? 1 : 0;
}

int main(int argc, char **argv) {
  if (argc < 2) { fprintf(stderr, "usage: %s AUDIO_FILE...\n", argv[0]); return 2; }
  printf("{\"ffmpeg_version\":\"%s\",\"libavcodec\":\"%u.%u.%u\",\"libavformat\":\"%u.%u.%u\"}\n",
         av_version_info(), AV_VERSION_MAJOR(avcodec_version()), AV_VERSION_MINOR(avcodec_version()), AV_VERSION_MICRO(avcodec_version()),
         AV_VERSION_MAJOR(avformat_version()), AV_VERSION_MINOR(avformat_version()), AV_VERSION_MICRO(avformat_version()));
  int status = 0;
  for (int i = 1; i < argc; ++i) status |= decode_file(argv[i]);
  return status;
}
