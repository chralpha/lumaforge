#include <emscripten/bind.h>

#include <stdexcept>
#include <string>
#include <vector>

namespace {

using emscripten::class_;
using emscripten::val;

class LumaJpegEncoder {
 public:
  LumaJpegEncoder(int width, int height, double quality) {
    if (width <= 0 || height <= 0 || quality <= 0 || quality > 1) {
      throw std::runtime_error("JPEG_INVALID_ENCODER_OPTIONS");
    }
  }

  void writeRows(val, int row_count) {
    if (row_count <= 0) {
      throw std::runtime_error("JPEG_INVALID_ROW_COUNT");
    }
    throw std::runtime_error("JPEG_NATIVE_ENCODER_NOT_LINKED");
  }

  val finish() { throw std::runtime_error("JPEG_NATIVE_ENCODER_NOT_LINKED"); }

  void abort() {}
};

}  // namespace

EMSCRIPTEN_BINDINGS(luma_jpeg_runtime) {
  class_<LumaJpegEncoder>("LumaJpegEncoder")
      .constructor<int, int, double>()
      .function("writeRows", &LumaJpegEncoder::writeRows)
      .function("finish", &LumaJpegEncoder::finish)
      .function("abort", &LumaJpegEncoder::abort);
}
