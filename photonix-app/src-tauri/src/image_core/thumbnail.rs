use image::imageops::FilterType;
use image::GenericImageView;
use std::path::Path;

/// Thumbnail generation configuration
const THUMB_MAX_SIZE: u32 = 256;
const PROXY_MAX_LONG_EDGE: u32 = 2560;

#[derive(Debug, Clone)]
pub struct ImageDimensions {
    pub width: u32,
    pub height: u32,
}

/// Get image dimensions by reading only the header.
pub fn get_dimensions(image_path: &str) -> Result<ImageDimensions, String> {
    let dim = image::image_dimensions(Path::new(image_path))
        .map_err(|e| format!("Failed to read dimensions for {}: {}", image_path, e))?;
    Ok(ImageDimensions {
        width: dim.0,
        height: dim.1,
    })
}

/// Generate a thumbnail (max 256px on longest edge) and save as WebP.
/// Uses two-pass downsampling for large images:
/// 1. Fast box-filter downscale to 4x target size (cheap, runs on raw RGBA)
/// 2. High-quality Lanczos3 to final size (only operates on the small intermediate)
/// This is dramatically faster than running Lanczos3 directly on a 7000+px source.
pub fn generate_thumbnail(
    source_path: &str,
    output_path: &str,
) -> Result<ImageDimensions, String> {
    let img = image::open(source_path)
        .map_err(|e| format!("Failed to open image {}: {}", source_path, e))?;

    let thumb = downscale_two_pass(&img, THUMB_MAX_SIZE);
    let (tw, th) = thumb.dimensions();

    let output = Path::new(output_path);
    if let Some(parent) = output.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create thumbnail dir: {}", e))?;
    }

    thumb
        .save(output)
        .map_err(|e| format!("Failed to save thumbnail: {}", e))?;

    Ok(ImageDimensions {
        width: tw,
        height: th,
    })
}

/// Generate a preview proxy (max 2560px on longest edge) and save as JPEG.
pub fn generate_proxy(source_path: &str, output_path: &str) -> Result<ImageDimensions, String> {
    let img = image::open(source_path)
        .map_err(|e| format!("Failed to open image {}: {}", source_path, e))?;

    let (sw, sh) = img.dimensions();

    // If already small enough, save as-is (re-encoded to JPEG)
    let proxy = if sw <= PROXY_MAX_LONG_EDGE && sh <= PROXY_MAX_LONG_EDGE {
        img
    } else {
        downscale_two_pass(&img, PROXY_MAX_LONG_EDGE)
    };

    let (pw, ph) = proxy.dimensions();

    let output = Path::new(output_path);
    if let Some(parent) = output.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create proxy dir: {}", e))?;
    }

    proxy
        .save(output)
        .map_err(|e| format!("Failed to save proxy: {}", e))?;

    Ok(ImageDimensions {
        width: pw,
        height: ph,
    })
}

/// Two-pass downscale: fast Triangle filter to ~2x target, then Lanczos3 to final.
/// Much cheaper than single-pass Lanczos3 on a huge source image.
fn downscale_two_pass(src: &image::DynamicImage, target_max: u32) -> image::DynamicImage {
    let (w, h) = src.dimensions();
    let max_edge = w.max(h);

    if max_edge <= target_max {
        return src.clone();
    }

    // If source is more than 4x larger than target, do an intermediate fast pass
    if max_edge > target_max * 4 {
        let intermediate = target_max * 2;
        let mid = src.resize(intermediate, intermediate, FilterType::Triangle);
        return mid.resize(target_max, target_max, FilterType::Lanczos3);
    }

    src.resize(target_max, target_max, FilterType::Lanczos3)
}
