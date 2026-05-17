import type { CandidateMode, CandidatePlan, StyleProfile } from "@/types";

/**
 * Hard-coded candidate variant fragments. Picked from MVP3 §33.5.4 example
 * candidates plus a few common landscape moods. The planner returns the
 * first `count` plans for the chosen mode.
 *
 * Future upgrade (§33.10.5): call the text model to plan candidate fragments
 * tuned to the user prompt and image type. For now the hard-coded set is
 * stable, free, and makes the rest of the pipeline testable end-to-end.
 */

interface VariantSeed {
  label: string;
  promptModifier: string;
  negativeModifier: string;
}

const NATURAL_VARIANTS: VariantSeed[] = [
  {
    label: "Natural Clarity",
    promptModifier:
      "subtle natural clarity, balanced contrast, realistic color, preserved sky and foliage detail",
    negativeModifier: "no HDR halos, no neon saturation",
  },
  {
    label: "Cool Morning",
    promptModifier:
      "cooler shadow tone, calm low-saturation morning mood, clean blue-cool atmosphere",
    negativeModifier: "no green or magenta cast, no over-darkening",
  },
  {
    label: "Warm Sunset",
    promptModifier:
      "warmer highlights, golden-hour atmosphere, preserved cool shadows, gentle global warmth",
    negativeModifier: "no orange wash, no blown highlights, no plastic look",
  },
  {
    label: "Soft Atmospheric",
    promptModifier:
      "soft atmospheric haze, lifted shadows, gentle contrast, dreamy yet realistic feel",
    negativeModifier: "no extreme blur, no fake fog overlay",
  },
];

const CINEMATIC_VARIANTS: VariantSeed[] = [
  {
    label: "Teal Shadows",
    promptModifier:
      "teal-leaning shadows, controlled contrast, slight cinematic color grade, preserved skin tones",
    negativeModifier: "no extreme color cast, no banding",
  },
  {
    label: "Warm Highlight Cinematic",
    promptModifier:
      "warm highlights, cool shadows, cinematic balance, slightly desaturated mid-tones",
    negativeModifier: "no orange-and-teal stereotype, no plastic look",
  },
  {
    label: "Moody Low Key",
    promptModifier:
      "deeper shadows, lower overall exposure, preserved highlight detail, atmospheric mood",
    negativeModifier: "no crushed blacks, no green cast",
  },
  {
    label: "Soft Cinematic",
    promptModifier:
      "soft contrast cinematic look, preserved color separation, gentle warm-cool balance",
    negativeModifier: "no fake film grain overlay, no flat washed look",
  },
];

const CLEAN_BRIGHT: VariantSeed[] = [
  {
    label: "Bright Clean",
    promptModifier: "lifted exposure, bright clean look, preserved highlight detail, neutral whites",
    negativeModifier: "no blown skies, no magenta cast",
  },
  {
    label: "Bright Punchy",
    promptModifier: "slightly punchy contrast, bright atmosphere, preserved natural color",
    negativeModifier: "no over-saturation, no plastic look",
  },
  {
    label: "Bright Pastel",
    promptModifier: "slightly pastel highlights, soft saturation, clean whites, calm mood",
    negativeModifier: "no color cast, no flat washed look",
  },
  {
    label: "Bright Editorial",
    promptModifier: "editorial brightness, controlled shadows, gentle clarity",
    negativeModifier: "no HDR, no neon greens",
  },
];

const MOODY: VariantSeed[] = [
  { label: "Moody Cool", promptModifier: "cool moody atmosphere, deeper shadows, soft highlight rolloff", negativeModifier: "no extreme darkening" },
  { label: "Moody Warm", promptModifier: "warm moody atmosphere, golden shadow undertone, soft contrast", negativeModifier: "no orange wash" },
  { label: "Moody Cinematic", promptModifier: "cinematic moody balance, subtle color grade, preserved detail", negativeModifier: "no banding, no crushed blacks" },
  { label: "Moody Soft", promptModifier: "soft moody pastel, gentle contrast, lifted shadows", negativeModifier: "no faded look" },
];

const WARM: VariantSeed[] = [
  { label: "Warm Subtle", promptModifier: "subtle warm shift, preserved natural color, gentle highlights", negativeModifier: "no orange wash" },
  { label: "Warm Strong", promptModifier: "stronger warm cast, golden atmosphere, preserved cool shadows", negativeModifier: "no overall orange tint" },
  { label: "Warm Sunset", promptModifier: "sunset warmth, preserved cloud detail, balanced shadows", negativeModifier: "no blown highlights" },
  { label: "Warm Editorial", promptModifier: "editorial warmth, controlled saturation, clean whites", negativeModifier: "no neon yellows" },
];

const COOL: VariantSeed[] = [
  { label: "Cool Subtle", promptModifier: "subtle cool shift, calm mood, preserved natural skin tones if any", negativeModifier: "no green cast" },
  { label: "Cool Strong", promptModifier: "stronger cool cast, blue-cool shadows, preserved highlight warmth", negativeModifier: "no magenta tint" },
  { label: "Cool Morning", promptModifier: "morning cool atmosphere, calm low saturation, clean sky", negativeModifier: "no over-darkening" },
  { label: "Cool Editorial", promptModifier: "editorial cool look, preserved skin tone if any, controlled shadows", negativeModifier: "no green cast" },
];

const VARIANT_BY_MODE: Record<CandidateMode, VariantSeed[]> = {
  natural: NATURAL_VARIANTS,
  cinematic: CINEMATIC_VARIANTS,
  clean_bright: CLEAN_BRIGHT,
  moody: MOODY,
  warm: WARM,
  cool: COOL,
  // style_variants is computed from the selected style; falls back to natural
  style_variants: NATURAL_VARIANTS,
};

export interface PlanCandidatesInput {
  count: 2 | 3 | 4;
  mode: CandidateMode;
  style: StyleProfile | null;
}

export function planCandidates(input: PlanCandidatesInput): CandidatePlan[] {
  const seeds = VARIANT_BY_MODE[input.mode] ?? NATURAL_VARIANTS;
  return seeds.slice(0, input.count).map((seed) => {
    const styleSuffix = input.style
      ? `. Match this style: ${input.style.styleSummary}`
      : "";
    return {
      id: crypto.randomUUID(),
      label: seed.label,
      promptModifier: seed.promptModifier + styleSuffix,
      negativeModifier: seed.negativeModifier,
    };
  });
}
