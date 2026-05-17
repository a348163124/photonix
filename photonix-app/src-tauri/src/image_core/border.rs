//! Border / canvas templates applied locally during export (MVP3 §33.7.2).
//!
//! All operations are pure pixel work — no AI, no network. Runs inside
//! `tokio::task::spawn_blocking` from the export command so the UI stays
//! responsive on large images.

use image::{DynamicImage, GenericImageView, Rgba, RgbaImage};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BorderConfig {
    /// Border thickness in source-resolution pixels.
    pub thickness: u32,
    /// Hex color string, e.g. "#FFFFFF". Falls back to white on parse error.
    pub color: String,
    /// Optional inner padding (between image and colored frame).
    pub inner_padding: Option<u32>,
    /// When true, only render top + bottom bars (cinematic letterbox).
    pub letterbox: bool,
    /// When set, force the final canvas to this aspect ratio (width/height).
    pub forced_aspect: Option<f32>,
}

pub fn apply_border(img: DynamicImage, cfg: &BorderConfig) -> DynamicImage {
    let (color_r, color_g, color_b) = parse_hex(&cfg.color).unwrap_or((255, 255, 255));
    let pad = cfg.inner_padding.unwrap_or(0);
    let t = cfg.thickness;

    if t == 0 && pad == 0 && cfg.forced_aspect.is_none() {
        return img;
    }

    let (sw, sh) = img.dimensions();
    let inner_w = sw + 2 * pad;
    let inner_h = sh + 2 * pad;

    let (mut canvas_w, mut canvas_h) = if cfg.letterbox {
        (inner_w, inner_h + 2 * t)
    } else {
        (inner_w + 2 * t, inner_h + 2 * t)
    };

    // Forced aspect: extend the smaller dimension to match
    if let Some(aspect) = cfg.forced_aspect {
        if aspect > 0.0 {
            let current = canvas_w as f32 / canvas_h as f32;
            if (current - aspect).abs() > f32::EPSILON {
                if current < aspect {
                    canvas_w = (canvas_h as f32 * aspect).round() as u32;
                } else {
                    canvas_h = (canvas_w as f32 / aspect).round() as u32;
                }
            }
        }
    }

    let mut canvas = RgbaImage::from_pixel(
        canvas_w.max(1),
        canvas_h.max(1),
        Rgba([color_r, color_g, color_b, 255]),
    );

    // Center the original image inside the canvas
    let dx = (canvas_w.saturating_sub(sw)) / 2;
    let dy = (canvas_h.saturating_sub(sh)) / 2;

    let src = img.to_rgba8();
    image::imageops::overlay(&mut canvas, &src, dx as i64, dy as i64);

    DynamicImage::ImageRgba8(canvas)
}

fn parse_hex(hex: &str) -> Option<(u8, u8, u8)> {
    let s = hex.trim().trim_start_matches('#');
    if s.len() != 6 {
        return None;
    }
    let r = u8::from_str_radix(&s[0..2], 16).ok()?;
    let g = u8::from_str_radix(&s[2..4], 16).ok()?;
    let b = u8::from_str_radix(&s[4..6], 16).ok()?;
    Some((r, g, b))
}
