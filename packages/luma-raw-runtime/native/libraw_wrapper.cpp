#include <emscripten/bind.h>
#include <emscripten/val.h>
#include <libraw/libraw.h>

#include <cstdint>
#include <cstring>
#include <limits>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

namespace {

using emscripten::class_;
using emscripten::typed_memory_view;
using emscripten::val;

std::string librawError(const std::string &operation, int code) {
  return operation + " failed: " + LibRaw::strerror(code);
}

void requireLibRawSuccess(const std::string &operation, int code) {
  if (code != LIBRAW_SUCCESS) {
    throw std::runtime_error(librawError(operation, code));
  }
}

std::string thumbnailFormat(enum LibRaw_thumbnail_formats format) {
  switch (format) {
    case LIBRAW_THUMBNAIL_JPEG:
      return "jpeg";
    case LIBRAW_THUMBNAIL_BITMAP:
    case LIBRAW_THUMBNAIL_BITMAP16:
      return "bitmap";
    default:
      return "unknown";
  }
}

std::string processedImageFormat(enum LibRaw_image_formats format) {
  switch (format) {
    case LIBRAW_IMAGE_JPEG:
      return "jpeg";
    case LIBRAW_IMAGE_BITMAP:
      return "bitmap";
    default:
      return "unknown";
  }
}

bool isUnavailableThumbnailError(int code) {
  return code == LIBRAW_NO_THUMBNAIL ||
         code == LIBRAW_UNSUPPORTED_THUMBNAIL ||
         code == LIBRAW_REQUEST_FOR_NONEXISTENT_THUMBNAIL;
}

std::string safeString(const char *value) {
  return value == nullptr ? std::string() : std::string(value);
}

val copiedUint8Array(const unsigned char *data, size_t size) {
  return val::global("Uint8Array").new_(typed_memory_view(size, data));
}

val copiedUint16Array(const uint16_t *data, size_t size) {
  return val::global("Uint16Array").new_(typed_memory_view(size, data));
}

size_t checkedMultiply(size_t left, size_t right, const std::string &label) {
  if (left != 0 && right > std::numeric_limits<size_t>::max() / left) {
    throw std::runtime_error(label + " exceeds native addressable memory.");
  }

  return left * right;
}

class LumaRawProcessor {
 public:
  void openBuffer(val data, val settings) {
    processor_.recycle();
    processed_ = false;

    const size_t length = data["length"].as<size_t>();
    input_buffer_.resize(length);
    for (size_t i = 0; i < length; ++i) {
      input_buffer_[i] = data[static_cast<int>(i)].as<unsigned char>();
    }

    applySettings(settings);
    requireLibRawSuccess(
        "LibRaw open_buffer",
        processor_.open_buffer(input_buffer_.data(), input_buffer_.size()));
  }

  val readMetadata() {
    const libraw_data_t &imgdata = processor_.imgdata;
    const libraw_image_sizes_t &sizes = imgdata.sizes;
    const libraw_iparams_t &idata = imgdata.idata;
    const libraw_lensinfo_t &lens = imgdata.lens;
    const libraw_imgother_t &other = imgdata.other;
    const libraw_colordata_t &color = imgdata.color;
    const libraw_thumbnail_t &thumbnail = imgdata.thumbnail;

    val metadata = val::object();
    metadata.set("width", sizes.width);
    metadata.set("height", sizes.height);
    metadata.set("rawWidth", sizes.raw_width);
    metadata.set("rawHeight", sizes.raw_height);
    metadata.set("make", safeString(idata.make));
    metadata.set("model", safeString(idata.model));
    metadata.set("lens", safeString(lens.Lens));
    metadata.set("iso", other.iso_speed);
    metadata.set("aperture", other.aperture);
    metadata.set("focalLength", other.focal_len);
    metadata.set("shutter", other.shutter);
    metadata.set("timestamp", static_cast<double>(other.timestamp));
    metadata.set("orientation", sizes.flip);
    metadata.set("blackLevel", color.black);
    metadata.set("whiteLevel", color.maximum);
    metadata.set("thumbWidth", thumbnail.twidth);
    metadata.set("thumbHeight", thumbnail.theight);
    metadata.set("thumbFormat", thumbnailFormat(thumbnail.tformat));
    return metadata;
  }

  val extractThumbnail() {
    int code = processor_.unpack_thumb();
    if (isUnavailableThumbnailError(code)) {
      return val::undefined();
    }
    requireLibRawSuccess("LibRaw unpack_thumb", code);

    int image_error = LIBRAW_SUCCESS;
    std::unique_ptr<libraw_processed_image_t, decltype(&LibRaw::dcraw_clear_mem)>
        image(processor_.dcraw_make_mem_thumb(&image_error),
              &LibRaw::dcraw_clear_mem);
    if (!image) {
      if (isUnavailableThumbnailError(image_error)) {
        return val::undefined();
      }
      requireLibRawSuccess("LibRaw dcraw_make_mem_thumb", image_error);
      return val::undefined();
    }

    val thumbnail = val::object();
    thumbnail.set("data", copiedUint8Array(image->data, image->data_size));
    thumbnail.set("width", image->width);
    thumbnail.set("height", image->height);
    thumbnail.set("format", processedImageFormat(image->type));
    return thumbnail;
  }

  val decodePreview() { return decodeImage(); }

  val decodeHq() { return decodeImage(); }

 private:
  void applySettings(val settings) {
    libraw_output_params_t &params = processor_.imgdata.params;
    params.half_size = settings["halfSize"].as<bool>() ? 1 : 0;
    params.use_camera_wb = settings["useCameraWb"].as<bool>() ? 1 : 0;
    params.output_color = settings["outputColor"].as<int>();
    params.output_bps = settings["outputBps"].as<int>();
    params.no_auto_bright = settings["noAutoBright"].as<bool>() ? 1 : 0;
    params.user_qual = settings["userQual"].as<int>();

    val gamma = settings["gamm"];
    for (int i = 0; i < 6; ++i) {
      params.gamm[i] = gamma[i].as<double>();
    }
  }

  void ensureProcessed() {
    if (processed_) {
      return;
    }

    requireLibRawSuccess("LibRaw unpack", processor_.unpack());
    requireLibRawSuccess("LibRaw dcraw_process", processor_.dcraw_process());
    processed_ = true;
  }

  val decodeImage() {
    ensureProcessed();

    int image_error = LIBRAW_SUCCESS;
    std::unique_ptr<libraw_processed_image_t, decltype(&LibRaw::dcraw_clear_mem)>
        image(processor_.dcraw_make_mem_image(&image_error),
              &LibRaw::dcraw_clear_mem);
    if (!image) {
      requireLibRawSuccess("LibRaw dcraw_make_mem_image", image_error);
      throw std::runtime_error("LibRaw dcraw_make_mem_image returned no image.");
    }

    if (image->type != LIBRAW_IMAGE_BITMAP || image->colors != 3 ||
        image->bits != 16) {
      throw std::runtime_error(
          "LibRaw output is not the expected RGB16 bitmap image.");
    }

    const size_t pixel_count =
        checkedMultiply(static_cast<size_t>(image->width),
                        static_cast<size_t>(image->height),
                        "LibRaw RGB16 pixel count");
    const size_t sample_count =
        checkedMultiply(pixel_count, static_cast<size_t>(image->colors),
                        "LibRaw RGB16 sample count");
    const size_t byte_count =
        checkedMultiply(sample_count, sizeof(uint16_t),
                        "LibRaw RGB16 byte count");
    if (image->data_size < byte_count) {
      throw std::runtime_error(
          "LibRaw RGB16 image buffer is smaller than expected.");
    }

    std::vector<uint16_t> rgb(sample_count);
    std::memcpy(rgb.data(), image->data, byte_count);

    val output = val::object();
    output.set("data", copiedUint16Array(rgb.data(), rgb.size()));
    output.set("width", image->width);
    output.set("height", image->height);
    return output;
  }

  LibRaw processor_;
  std::vector<unsigned char> input_buffer_;
  bool processed_ = false;
};

}  // namespace

EMSCRIPTEN_BINDINGS(luma_raw_runtime) {
  class_<LumaRawProcessor>("LumaRawProcessor")
      .constructor<>()
      .function("openBuffer", &LumaRawProcessor::openBuffer)
      .function("readMetadata", &LumaRawProcessor::readMetadata)
      .function("extractThumbnail", &LumaRawProcessor::extractThumbnail)
      .function("decodePreview", &LumaRawProcessor::decodePreview)
      .function("decodeHq", &LumaRawProcessor::decodeHq);
}
