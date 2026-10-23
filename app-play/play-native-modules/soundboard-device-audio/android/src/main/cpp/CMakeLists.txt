cmake_minimum_required(VERSION 3.22.1)
project(soundboard_playback_dsp LANGUAGES CXX)

add_library(soundboard_playback_dsp SHARED playback_dsp.cpp playback_dsp_jni.cpp)
target_compile_features(soundboard_playback_dsp PRIVATE cxx_std_17)
target_compile_options(soundboard_playback_dsp PRIVATE -O3 -ffp-contract=off -fvisibility=hidden)
target_link_options(soundboard_playback_dsp PRIVATE -Wl,-z,max-page-size=16384)
find_library(android_log log)
target_link_libraries(soundboard_playback_dsp PRIVATE ${android_log})
