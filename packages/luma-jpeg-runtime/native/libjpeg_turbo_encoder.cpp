#include <emscripten/bind.h>
#include <emscripten/val.h>
#include <jpeglib.h>

#include <csetjmp>
#include <cstdint>
#include <cstdlib>
#include <stdexcept>
#include <string>
#include <vector>

namespace {

using emscripten::class_;
using emscripten::typed_memory_view;
using emscripten::val;

struct JpegErrorManager {
  jpeg_error_mgr pub;
  jmp_buf jump;
  char message[JMSG_LENGTH_MAX];
};

void errorExit(j_common_ptr cinfo) {
  auto* manager = reinterpret_cast<JpegErrorManager*>(cinfo->err);
  (*cinfo->err->format_message)(cinfo, manager->message);
  longjmp(manager->jump, 1);
}

class LumaJpegEncoder {
 public:
  LumaJpegEncoder(int width, int height, double quality)
      : width_(width), height_(height) {
    if (width <= 0 || height <= 0) {
      throw std::runtime_error("JPEG_INVALID_DIMENSIONS");
    }
    if (quality <= 0 || quality > 1) {
      throw std::runtime_error("JPEG_INVALID_QUALITY");
    }

    cinfo_.err = jpeg_std_error(&error_.pub);
    error_.pub.error_exit = errorExit;
    if (setjmp(error_.jump)) {
      std::string message(error_.message);
      cleanup();
      throw std::runtime_error(message);
    }

    jpeg_create_compress(&cinfo_);
    created_ = true;
    jpeg_mem_dest(&cinfo_, &out_buffer_, &out_size_);
    cinfo_.image_width = static_cast<JDIMENSION>(width_);
    cinfo_.image_height = static_cast<JDIMENSION>(height_);
    cinfo_.input_components = 3;
    cinfo_.in_color_space = JCS_RGB;
    jpeg_set_defaults(&cinfo_);
    cinfo_.comp_info[0].h_samp_factor = 1;
    cinfo_.comp_info[0].v_samp_factor = 1;
    cinfo_.comp_info[1].h_samp_factor = 1;
    cinfo_.comp_info[1].v_samp_factor = 1;
    cinfo_.comp_info[2].h_samp_factor = 1;
    cinfo_.comp_info[2].v_samp_factor = 1;
    jpeg_set_quality(&cinfo_, static_cast<int>(quality * 100 + 0.5), TRUE);
    jpeg_start_compress(&cinfo_, TRUE);
  }

  ~LumaJpegEncoder() { cleanup(); }

  void writeRows(val rows, int row_count) {
    if (aborted_) throw std::runtime_error("JPEG_RUNTIME_ABORTED");
    if (finished_) throw std::runtime_error("JPEG_RUNTIME_FINISHED");
    if (row_count <= 0) throw std::runtime_error("JPEG_INVALID_ROW_COUNT");
    if (row_count > height_ - written_rows_) {
      throw std::runtime_error("JPEG_ROW_COUNT_EXCEEDED");
    }

    const size_t expected =
        static_cast<size_t>(width_) * static_cast<size_t>(row_count) * 3;
    const size_t byte_length = rows["byteLength"].as<size_t>();
    if (byte_length != expected) {
      throw std::runtime_error("JPEG_ROW_LENGTH_MISMATCH");
    }

    row_buffer_.resize(expected);
    val view = val(typed_memory_view(row_buffer_.size(), row_buffer_.data()));
    view.call<void>("set", rows);

    if (setjmp(error_.jump)) {
      throw std::runtime_error(error_.message);
    }

    JSAMPROW row_pointer[1];
    for (int row = 0; row < row_count; ++row) {
      row_pointer[0] =
          reinterpret_cast<JSAMPROW>(row_buffer_.data() +
                                     static_cast<size_t>(row) * width_ * 3);
      jpeg_write_scanlines(&cinfo_, row_pointer, 1);
      ++written_rows_;
    }
  }

  val finish() {
    if (aborted_) throw std::runtime_error("JPEG_RUNTIME_ABORTED");
    if (finished_) throw std::runtime_error("JPEG_RUNTIME_FINISHED");
    if (written_rows_ != height_) {
      throw std::runtime_error("JPEG_INCOMPLETE_IMAGE");
    }

    if (setjmp(error_.jump)) {
      throw std::runtime_error(error_.message);
    }

    jpeg_finish_compress(&cinfo_);
    finished_ = true;
    val bytes =
        val::global("Uint8Array").new_(typed_memory_view(out_size_, out_buffer_));
    cleanup();
    return bytes;
  }

  void abort() {
    aborted_ = true;
    cleanup();
  }

 private:
  void cleanup() {
    if (cleaned_) return;
    cleaned_ = true;
    if (created_) {
      jpeg_destroy_compress(&cinfo_);
      created_ = false;
    }
    if (out_buffer_ != nullptr) {
      free(out_buffer_);
      out_buffer_ = nullptr;
      out_size_ = 0;
    }
  }

  int width_;
  int height_;
  int written_rows_ = 0;
  bool aborted_ = false;
  bool finished_ = false;
  bool cleaned_ = false;
  bool created_ = false;
  jpeg_compress_struct cinfo_{};
  JpegErrorManager error_{};
  unsigned char* out_buffer_ = nullptr;
  unsigned long out_size_ = 0;
  std::vector<uint8_t> row_buffer_;
};

}  // namespace

EMSCRIPTEN_BINDINGS(luma_jpeg_runtime) {
  class_<LumaJpegEncoder>("LumaJpegEncoder")
      .constructor<int, int, double>()
      .function("writeRows", &LumaJpegEncoder::writeRows)
      .function("finish", &LumaJpegEncoder::finish)
      .function("abort", &LumaJpegEncoder::abort);
}
