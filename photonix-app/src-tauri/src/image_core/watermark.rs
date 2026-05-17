//! Text watermark rendering (MVP3 §33.7.3).
//!
//! Uses a bundled DejaVu Sans TTF and `ab_glyph` to rasterize glyphs onto an
//! `RgbaImage`. No system font dependency, no AI, no network.

use ab_glyph::{Font, FontVec, PxScale, ScaleFont};
use image::{DynamicImage, GenericImageView, Rgba, RgbaImage};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatermarkConfig {
    pub text: String,
    pub position: WatermarkPosition,
    pub font_size: f32,
    pub color: String, // hex like "#FFFFFF"
    pub opacity: f32,  // 0..1
    pub margin: u32,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WatermarkPosition {
    BottomRight,
    BottomLeft,
    BottomCenter,
    TopRight,
    TopLeft,
}

const FONT_BYTES: &[u8] = include_bytes!("../../assets/DejaVuSans.ttf");

pub fn apply_watermark(img: DynamicImage, cfg: &WatermarkConfig) -> Result<DynamicImage, String> {
    if cfg.text.is_empty() || cfg.font_size <= 0.0 {
        return Ok(img);
    }

    let font = FontVec::try_from_vec(FONT_BYTES.to_vec())
        .map_err(|e| format!("Failed to load watermark font: {}", e))?;

    let scale = PxScale::from(cfg.font_size.max(8.0));
    let scaled_font = font.as_scaled(scale);

    // Measure the text run
    let mut total_width = 0f32;
    let mut max_ascent = 0f32;
    let mut max_descent: f32 = 0.0;
    let mut prev_glyph_id: Option<ab_glyph::GlyphId> = None;
    for ch in cfg.text.chars() {
        let glyph_id = scaled_font.glyph_id(ch);
        let advance = scaled_font.h_advance(glyph_id);
        if let Some(prev) = prev_glyph_id {
            total_width += scaled_font.kern(prev, glyph_id);
        }
        total_width += advance;
        max_ascent = max_ascent.max(scaled_font.ascent());
        max_descent = max_descent.max(scaled_font.descent().abs());
        prev_glyph_id = Some(glyph_id);
    }

    let text_w = total_width.ceil() as u32;
    let text_h = (max_ascent + max_descent).ceil() as u32;

    let (canvas_w, canvas_h) = img.dimensions();
    if text_w == 0 || text_h == 0 || text_w > canvas_w || text_h > canvas_h {
        return Ok(img);
    }

    let (origin_x, baseline_y) =
        compute_origin(canvas_w, canvas_h, text_w, text_h, cfg.margin, cfg.position);

    let (cr, cg, cb) = parse_hex(&cfg.color).unwrap_or((255, 255, 255));
    let opacity = cfg.opacity.clamp(0.0, 1.0);

    // Render onto an RGBA copy of the source
    let mut canvas: RgbaImage = img.to_rgba8();

    let mut cursor_x = origin_x as f32;
    let mut prev_glyph_id: Option<ab_glyph::GlyphId> = None;
    for ch in cfg.text.chars() {
        let glyph_id = scaled_font.glyph_id(ch);
        if let Some(prev) = prev_glyph_id {
            cursor_x += scaled_font.kern(prev, glyph_id);
        }
        let advance = scaled_font.h_advance(glyph_id);

        let glyph = glyph_id.with_scale_and_position(
            scale,
            ab_glyph::point(cursor_x, baseline_y as f32),
        );
        if let Some(outlined) = scaled_font.outline_glyph(glyph) {
            let bb = outlined.px_bounds();
            outlined.draw(|gx, gy, coverage| {
                let px = bb.min.x as i32 + gx as i32;
                let py = bb.min.y as i32 + gy as i32;
                if px < 0 || py < 0 {
                    return;
                }
                let (px_u, py_u) = (px as u32, py as u32);
                if px_u >= canvas_w || py_u >= canvas_h {
                    return;
                }
                let alpha = (coverage * opacity).clamp(0.0, 1.0);
                if alpha <= 0.0 {
                    return;
                }
                let bg = canvas.get_pixel(px_u, py_u);
                let blended = blend_over(*bg, (cr, cg, cb), alpha);
                canvas.put_pixel(px_u, py_u, blended);
            });
        }

        cursor_x += advance;
        prev_glyph_id = Some(glyph_id);
    }

    Ok(DynamicImage::ImageRgba8(canvas))
}

fn compute_origin(
    canvas_w: u32,
    canvas_h: u32,
    text_w: u32,
    text_h: u32,
    margin: u32,
    pos: WatermarkPosition,
) -> (u32, u32) {
    // Returns (x_origin, baseline_y). Baseline is the bottom of the text.
    let m = margin;
    match pos {
        WatermarkPosition::BottomRight => (
            canvas_w.saturating_sub(text_w + m),
            canvas_h.saturating_sub(m),
        ),
        WatermarkPosition::BottomLeft => (m, canvas_h.saturating_sub(m)),
        WatermarkPosition::BottomCenter => (
            (canvas_w.saturating_sub(text_w)) / 2,
            canvas_h.saturating_sub(m),
        ),
        WatermarkPosition::TopRight => (canvas_w.saturating_sub(text_w + m), m + text_h),
        WatermarkPosition::TopLeft => (m, m + text_h),
    }
}

fn blend_over(bg: Rgba<u8>, fg_rgb: (u8, u8, u8), alpha: f32) -> Rgba<u8> {
    let (fr, fg, fb) = (fg_rgb.0 as f32, fg_rgb.1 as f32, fg_rgb.2 as f32);
    let (br, bgc, bb) = (bg[0] as f32, bg[1] as f32, bg[2] as f32);
    let r = (fr * alpha + br * (1.0 - alpha)).round() as u8;
    let g = (fg * alpha + bgc * (1.0 - alpha)).round() as u8;
    let b = (fb * alpha + bb * (1.0 - alpha)).round() as u8;
    Rgba([r, g, b, bg[3].max((alpha * 255.0) as u8)])
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
