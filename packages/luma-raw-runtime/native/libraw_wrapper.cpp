#include <emscripten.h>
#include <emscripten/bind.h>
#include <emscripten/val.h>
#include <libraw/libraw.h>

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <limits>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

namespace {

using emscripten::class_;
using emscripten::typed_memory_view;
using emscripten::val;

struct OutputSize {
  int width;
  int height;
};

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

double nowMs() { return emscripten_get_now(); }

std::string safeString(const char *value) {
  return value == nullptr ? std::string() : std::string(value);
}

std::vector<unsigned char> copyInputBytes(val data) {
  const val Uint8Array = val::global("Uint8Array");
  const val ArrayBuffer = val::global("ArrayBuffer");

  val u8 = data.instanceof(Uint8Array)
               ? data
               : (data.instanceof(ArrayBuffer)
                      ? Uint8Array.new_(data)
                      : Uint8Array.new_(data["buffer"], data["byteOffset"],
                                        data["byteLength"]));

  const size_t length = u8["byteLength"].as<size_t>();
  std::vector<unsigned char> out(length);
  if (out.empty()) {
    return out;
  }

  val wasmView = val(typed_memory_view(out.size(), out.data()));
  wasmView.call<void>("set", u8);
  return out;
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

std::string cfaPatternName(LibRaw &processor) {
  const int top_left = processor.COLOR(0, 0);
  const int top_right = processor.COLOR(0, 1);
  const int bottom_left = processor.COLOR(1, 0);
  const int bottom_right = processor.COLOR(1, 1);

  if (top_left == 0 && top_right == 1 && bottom_left == 1 &&
      bottom_right == 2) {
    return "rggb";
  }
  if (top_left == 2 && top_right == 1 && bottom_left == 1 &&
      bottom_right == 0) {
    return "bggr";
  }
  if (top_left == 1 && top_right == 0 && bottom_left == 2 &&
      bottom_right == 1) {
    return "grbg";
  }
  if (top_left == 1 && top_right == 2 && bottom_left == 0 &&
      bottom_right == 1) {
    return "gbrg";
  }

  return "unsupported";
}

bool hasBayerRawImage(const libraw_data_t &imgdata) {
  return imgdata.rawdata.raw_image != nullptr && imgdata.idata.filters != 0;
}

val cfaObject(const std::string &pattern) {
  val cfa = val::object();
  cfa.set("pattern", pattern);
  cfa.set("xPhase", 0);
  cfa.set("yPhase", 0);
  return cfa;
}

val visibleCropObject(int x, int y, int width, int height) {
  val crop = val::object();
  crop.set("x", x);
  crop.set("y", y);
  crop.set("width", width);
  crop.set("height", height);
  return crop;
}

int normalizedOrientationCode(int code) {
  return code == 0 ? 1 : code;
}

val orientationObject(int code) {
  const int normalized_code = code == 0 ? 1 : code;

  val orientation = val::object();
  orientation.set("code", normalized_code);
  orientation.set("supported", normalized_code == 1);
  return orientation;
}

val unsupportedCapability(const libraw_data_t &imgdata,
                          const std::string &reason) {
  const libraw_image_sizes_t &sizes = imgdata.sizes;
  const libraw_colordata_t &color = imgdata.color;

  val reasons = val::array();
  reasons.set(0, reason);

  val capability = val::object();
  capability.set("supported", false);
  capability.set("width", sizes.width);
  capability.set("height", sizes.height);
  capability.set("rawWidth", sizes.raw_width);
  capability.set("rawHeight", sizes.raw_height);
  capability.set("visibleCrop", visibleCropObject(sizes.left_margin,
                                                   sizes.top_margin,
                                                   sizes.width,
                                                   sizes.height));
  capability.set("cfa", cfaObject("unsupported"));
  capability.set("blackLevel", color.black);
  capability.set("whiteLevel", color.maximum);
  capability.set("orientation", orientationObject(sizes.flip));
  capability.set("reasons", reasons);
  return capability;
}

OutputSize planOutputSize(int width, int height, int max_pixels) {
  if (max_pixels <= 0 || static_cast<double>(width) * height <= max_pixels) {
    return {width, height};
  }

  const double scale =
      std::sqrt(static_cast<double>(max_pixels) /
                (static_cast<double>(width) * height));
  int out_width = std::max(1, static_cast<int>(std::floor(width * scale)));
  int out_height = std::max(1, static_cast<int>(std::floor(height * scale)));

  while (static_cast<double>(out_width) * out_height > max_pixels) {
    if (out_width >= out_height) {
      --out_width;
    } else {
      --out_height;
    }
  }

  return {out_width, out_height};
}

int maxOutputPixelsFromOptions(val options) {
  if (options.isNull() || options.isUndefined()) return 0;
  if (!options.hasOwnProperty("maxOutputPixels")) return 0;

  const val raw_max_output_pixels = options["maxOutputPixels"];
  if (raw_max_output_pixels.isNull() || raw_max_output_pixels.isUndefined()) {
    return 0;
  }

  const double max_output_pixels = raw_max_output_pixels.as<double>();
  if (!std::isfinite(max_output_pixels) || max_output_pixels <= 0 ||
      std::floor(max_output_pixels) != max_output_pixels ||
      max_output_pixels > std::numeric_limits<int>::max()) {
    throw std::runtime_error(
        "Luma RAW maxOutputPixels must be a finite positive integer no greater "
        "than INT_MAX.");
  }

  return static_cast<int>(max_output_pixels);
}

class LumaRawProcessor {
 public:
  val loadBuffer(val data) {
    const double copy_start = nowMs();
    input_buffer_ = copyInputBytes(data);
    const double copy_end = nowMs();

    val timings = val::object();
    timings.set("copyToWasm", copy_end - copy_start);
    return timings;
  }

  val openWithSettings(val settings) {
    if (input_buffer_.empty()) {
      throw std::runtime_error("LibRaw input buffer is empty.");
    }

    processor_.recycle();
    processed_ = false;

    applySettings(settings);
    const double open_start = nowMs();
    requireLibRawSuccess(
        "LibRaw open_buffer",
        processor_.open_buffer(input_buffer_.data(), input_buffer_.size()));
    const double open_end = nowMs();

    val timings = val::object();
    timings.set("copyToWasm", 0);
    timings.set("librawOpen", open_end - open_start);
    return timings;
  }

  val openBuffer(val data, val settings) {
    val copy_timings = loadBuffer(data);
    val open_timings = openWithSettings(settings);

    val timings = val::object();
    timings.set("copyToWasm", copy_timings["copyToWasm"].as<double>());
    timings.set("librawOpen", open_timings["librawOpen"].as<double>());
    return timings;
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

    const int fallback_width = processor_.imgdata.thumbnail.twidth;
    const int fallback_height = processor_.imgdata.thumbnail.theight;
    const int width = image->width > 0 ? image->width : fallback_width;
    const int height = image->height > 0 ? image->height : fallback_height;

    val thumbnail = val::object();
    thumbnail.set("data", copiedUint8Array(image->data, image->data_size));
    thumbnail.set("width", width);
    thumbnail.set("height", height);
    thumbnail.set("thumbWidth", fallback_width);
    thumbnail.set("thumbHeight", fallback_height);
    thumbnail.set("format", processedImageFormat(image->type));
    return thumbnail;
  }

  val decodePreview(val options = val::undefined()) {
    return decodeImage(maxOutputPixelsFromOptions(options));
  }

  val decodeHq(val options = val::undefined()) {
    return decodeImage(maxOutputPixelsFromOptions(options));
  }

  val probeExportCapability() {
    requireLibRawSuccess("LibRaw unpack", processor_.unpack());
    const libraw_data_t &imgdata = processor_.imgdata;
    const libraw_image_sizes_t &sizes = imgdata.sizes;
    const libraw_colordata_t &color = imgdata.color;

    if (sizes.width <= 0 || sizes.height <= 0 || sizes.raw_width <= 0 ||
        sizes.raw_height <= 0) {
      return unsupportedCapability(imgdata, "missing-dimensions");
    }
    if (color.maximum <= color.black) {
      return unsupportedCapability(imgdata, "missing-levels");
    }
    if (!hasBayerRawImage(imgdata)) {
      return unsupportedCapability(imgdata, "raw-window-unavailable");
    }

    const std::string pattern = cfaPatternName(processor_);
    if (pattern == "unsupported") {
      return unsupportedCapability(imgdata, "unsupported-cfa");
    }
    if (normalizedOrientationCode(sizes.flip) != 1) {
      return unsupportedCapability(imgdata, "unsupported-orientation");
    }

    return unsupportedCapability(imgdata, "missing-color-transform");
  }

  val readRawWindow(val rect) {
    requireLibRawSuccess("LibRaw unpack", processor_.unpack());
    const libraw_data_t &imgdata = processor_.imgdata;
    const libraw_image_sizes_t &sizes = imgdata.sizes;
    const libraw_colordata_t &color = imgdata.color;

    if (sizes.width <= 0 || sizes.height <= 0 || sizes.raw_width <= 0 ||
        sizes.raw_height <= 0 || color.maximum <= color.black ||
        !hasBayerRawImage(imgdata)) {
      throw std::runtime_error("LibRaw raw-window access is unavailable.");
    }

    const std::string pattern = cfaPatternName(processor_);
    if (pattern == "unsupported") {
      throw std::runtime_error("LibRaw raw-window access is unavailable.");
    }

    const int x = rect["x"].as<int>();
    const int y = rect["y"].as<int>();
    const int width = rect["width"].as<int>();
    const int height = rect["height"].as<int>();
    if (x < 0 || y < 0 || width <= 0 || height <= 0 ||
        width > sizes.raw_width || height > sizes.raw_height ||
        x > sizes.raw_width - width || y > sizes.raw_height - height) {
      throw std::runtime_error("RAW window rect is outside the RAW bounds.");
    }

    const uint16_t *source = imgdata.rawdata.raw_image;
    std::vector<uint16_t> window(
        checkedMultiply(static_cast<size_t>(width), static_cast<size_t>(height),
                        "RAW window pixel count"));

    for (int row = 0; row < height; ++row) {
      const size_t src = static_cast<size_t>(y + row) * sizes.raw_width + x;
      const size_t dst = static_cast<size_t>(row) * width;
      std::copy(source + src, source + src + width, window.data() + dst);
    }

    val out_rect = val::object();
    out_rect.set("x", x);
    out_rect.set("y", y);
    out_rect.set("width", width);
    out_rect.set("height", height);

    val output = val::object();
    output.set("rect", out_rect);
    output.set("cfa", cfaObject(pattern));
    output.set("data", copiedUint16Array(window.data(), window.size()));
    output.set("blackLevel", color.black);
    output.set("whiteLevel", color.maximum);
    return output;
  }

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

  val decodeImage(int max_output_pixels) {
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

    const OutputSize output_size =
        planOutputSize(image->width, image->height, max_output_pixels);
    const uint16_t *source = reinterpret_cast<const uint16_t *>(image->data);

    val output = val::object();
    if (output_size.width == image->width &&
        output_size.height == image->height) {
      output.set("data", copiedUint16Array(source, sample_count));
      output.set("width", image->width);
      output.set("height", image->height);
      return output;
    }

    const size_t output_pixel_count =
        checkedMultiply(static_cast<size_t>(output_size.width),
                        static_cast<size_t>(output_size.height),
                        "Luma RAW downsample pixel count");
    const size_t output_sample_count =
        checkedMultiply(output_pixel_count, static_cast<size_t>(3),
                        "Luma RAW downsample sample count");
    std::vector<uint16_t> resized(output_sample_count);

    for (int y = 0; y < output_size.height; ++y) {
      const int source_y = std::min(
          image->height - 1,
          static_cast<int>(std::floor(((static_cast<double>(y) + 0.5) *
                                       image->height) /
                                      output_size.height)));
      for (int x = 0; x < output_size.width; ++x) {
        const int source_x = std::min(
            image->width - 1,
            static_cast<int>(std::floor(((static_cast<double>(x) + 0.5) *
                                         image->width) /
                                        output_size.width)));
        const size_t src =
            (static_cast<size_t>(source_y) * image->width + source_x) * 3;
        const size_t dst =
            (static_cast<size_t>(y) * output_size.width + x) * 3;
        resized[dst] = source[src];
        resized[dst + 1] = source[src + 1];
        resized[dst + 2] = source[src + 2];
      }
    }

    output.set("data", copiedUint16Array(resized.data(), resized.size()));
    output.set("width", output_size.width);
    output.set("height", output_size.height);
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
      .function("loadBuffer", &LumaRawProcessor::loadBuffer)
      .function("openWithSettings", &LumaRawProcessor::openWithSettings)
      .function("openBuffer", &LumaRawProcessor::openBuffer)
      .function("readMetadata", &LumaRawProcessor::readMetadata)
      .function("extractThumbnail", &LumaRawProcessor::extractThumbnail)
      .function("probeExportCapability",
                &LumaRawProcessor::probeExportCapability)
      .function("readRawWindow", &LumaRawProcessor::readRawWindow)
      .function("decodePreview", &LumaRawProcessor::decodePreview)
      .function("decodeHq", &LumaRawProcessor::decodeHq);
}
