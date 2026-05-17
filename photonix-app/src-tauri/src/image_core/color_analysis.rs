//! Lightweight local color analysis for reference style images.
//!
//! Produces a small numeric summary plus a dominant palette without sending
//! the image to any model. Used to seed style profile UI and to give the AI
//! style analyzer ground-truth context.

use image::{DynamicImage, GenericImageView};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalColorAnalysis {
    pub dominant_palette: Vec<String>, // hex strings, brightest-first
    pub average_hsl: HslSummary,
    pub warm_cool_balance: f32, // -1.0 cool, 0 neutral, +1.0 warm
    pub saturation_mean: f32,   // 0..1
    pub contrast_estimate: f32, // 0..1
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HslSummary {
    pub h: f32, // 0..360
    pub s: f32, // 0..1
    pub l: f32, // 0..1
}

const PALETTE_BUCKETS: usize = 32; // 32x32x32 RGB histogram before reduction
const PALETTE_OUT: usize = 6;
const SAMPLE_LONG_EDGE: u32 = 256;

pub fn analyze(path: &str) -> Result<LocalColorAnalysis, String> {
    let img = image::open(path).map_err(|e| format!("Failed to open reference: {}", e))?;
    let small = downsample(&img, SAMPLE_LONG_EDGE);
    let rgba = small.to_rgba8();

    let pixel_count = (rgba.width() * rgba.height()) as usize;
    if pixel_count == 0 {
        return Err("Reference image is empty".into());
    }

    // Pass 1: averages, saturation, warm/cool, brightness for contrast
    let mut sum_h = 0f64;
    let mut sum_s = 0f64;
    let mut sum_l = 0f64;
    let mut sum_warm = 0f64;
    let mut min_l: f32 = 1.0;
    let mut max_l: f32 = 0.0;

    let mut histogram = vec![0u32; PALETTE_BUCKETS * PALETTE_BUCKETS * PALETTE_BUCKETS];

    for pixel in rgba.pixels() {
        let r = pixel[0] as f32 / 255.0;
        let g = pixel[1] as f32 / 255.0;
        let b = pixel[2] as f32 / 255.0;

        // Quantize for histogram
        let qr = ((r * (PALETTE_BUCKETS as f32 - 1.0)).round() as usize).min(PALETTE_BUCKETS - 1);
        let qg = ((g * (PALETTE_BUCKETS as f32 - 1.0)).round() as usize).min(PALETTE_BUCKETS - 1);
        let qb = ((b * (PALETTE_BUCKETS as f32 - 1.0)).round() as usize).min(PALETTE_BUCKETS - 1);
        let bucket = qr * PALETTE_BUCKETS * PALETTE_BUCKETS + qg * PALETTE_BUCKETS + qb;
        histogram[bucket] = histogram[bucket].saturating_add(1);

        let (h, s, l) = rgb_to_hsl(r, g, b);
        sum_h += h as f64;
        sum_s += s as f64;
        sum_l += l as f64;
        sum_warm += r as f64 - b as f64; // simple warmth proxy

        min_l = min_l.min(l);
        max_l = max_l.max(l);
    }

    let avg_h = (sum_h / pixel_count as f64) as f32;
    let avg_s = (sum_s / pixel_count as f64) as f32;
    let avg_l = (sum_l / pixel_count as f64) as f32;
    let warm_cool = (sum_warm / pixel_count as f64).clamp(-1.0, 1.0) as f32;
    let contrast = (max_l - min_l).clamp(0.0, 1.0);

    // Reduce histogram into top-N buckets (greedy: pick highest count, suppress neighbors)
    let palette = top_palette(&histogram, PALETTE_OUT);

    Ok(LocalColorAnalysis {
        dominant_palette: palette,
        average_hsl: HslSummary {
            h: avg_h,
            s: avg_s,
            l: avg_l,
        },
        warm_cool_balance: warm_cool,
        saturation_mean: avg_s,
        contrast_estimate: contrast,
    })
}

fn downsample(img: &DynamicImage, max_edge: u32) -> DynamicImage {
    let (w, h) = img.dimensions();
    let edge = w.max(h);
    if edge <= max_edge {
        return img.clone();
    }
    let scale = max_edge as f32 / edge as f32;
    let tw = ((w as f32 * scale) as u32).max(1);
    let th = ((h as f32 * scale) as u32).max(1);
    img.resize(tw, th, image::imageops::FilterType::Triangle)
}

fn rgb_to_hsl(r: f32, g: f32, b: f32) -> (f32, f32, f32) {
    let max = r.max(g).max(b);
    let min = r.min(g).min(b);
    let l = (max + min) * 0.5;
    if (max - min).abs() < f32::EPSILON {
        return (0.0, 0.0, l);
    }
    let d = max - min;
    let s = if l > 0.5 { d / (2.0 - max - min) } else { d / (max + min) };
    let h = if max == r {
        ((g - b) / d) + if g < b { 6.0 } else { 0.0 }
    } else if max == g {
        (b - r) / d + 2.0
    } else {
        (r - g) / d + 4.0
    };
    (h * 60.0, s, l)
}

fn top_palette(histogram: &[u32], count: usize) -> Vec<String> {
    // Greedy: pick the highest bucket, zero out a small neighborhood, repeat.
    let mut hist = histogram.to_vec();
    let mut result = Vec::with_capacity(count);

    for _ in 0..count {
        let mut best_idx = 0usize;
        let mut best_val = 0u32;
        for (i, &v) in hist.iter().enumerate() {
            if v > best_val {
                best_val = v;
                best_idx = i;
            }
        }
        if best_val == 0 {
            break;
        }

        let (r_q, g_q, b_q) = unbucket(best_idx);
        // Convert quantized back to 0..255
        let r = ((r_q as f32 / (PALETTE_BUCKETS as f32 - 1.0)) * 255.0).round() as u8;
        let g = ((g_q as f32 / (PALETTE_BUCKETS as f32 - 1.0)) * 255.0).round() as u8;
        let b = ((b_q as f32 / (PALETTE_BUCKETS as f32 - 1.0)) * 255.0).round() as u8;
        result.push(format!("#{:02X}{:02X}{:02X}", r, g, b));

        // Suppress a 3x3x3 neighborhood so we don't pick near-duplicates
        for dr in -1i32..=1 {
            for dg in -1i32..=1 {
                for db in -1i32..=1 {
                    let nr = r_q as i32 + dr;
                    let ng = g_q as i32 + dg;
                    let nb = b_q as i32 + db;
                    if nr < 0
                        || ng < 0
                        || nb < 0
                        || nr >= PALETTE_BUCKETS as i32
                        || ng >= PALETTE_BUCKETS as i32
                        || nb >= PALETTE_BUCKETS as i32
                    {
                        continue;
                    }
                    let bucket = (nr as usize) * PALETTE_BUCKETS * PALETTE_BUCKETS
                        + (ng as usize) * PALETTE_BUCKETS
                        + (nb as usize);
                    hist[bucket] = 0;
                }
            }
        }
    }

    result
}

fn unbucket(idx: usize) -> (usize, usize, usize) {
    let r = idx / (PALETTE_BUCKETS * PALETTE_BUCKETS);
    let rem = idx % (PALETTE_BUCKETS * PALETTE_BUCKETS);
    let g = rem / PALETTE_BUCKETS;
    let b = rem % PALETTE_BUCKETS;
    (r, g, b)
}
