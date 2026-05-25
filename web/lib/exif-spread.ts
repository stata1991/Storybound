import { parse } from "exifr";

/**
 * Read the DateTimeOriginal (preferred) or ModifyDate (fallback) EXIF tag
 * from a photo File. Returns null on any error or if no date tag is present.
 */
export async function readPhotoTakenAt(file: File): Promise<Date | null> {
  try {
    const exif = await parse(file, {
      pick: ["DateTimeOriginal", "ModifyDate"],
    });
    if (!exif) return null;
    const raw = exif.DateTimeOriginal ?? exif.ModifyDate;
    if (!raw) return null;
    // exifr returns Date objects for known date tags
    if (raw instanceof Date && !isNaN(raw.getTime())) return raw;
    // Fallback: parse EXIF string "YYYY:MM:DD HH:MM:SS"
    if (typeof raw === "string") {
      const normalized = raw.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3");
      const parsed = new Date(normalized);
      return isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Compute the time spread across a set of photo dates.
 * Returns spread_days only if >= 70% of photos have a parseable date.
 */
export function computeSpreadDays(
  dates: (Date | null)[]
): { spread_days: number | null; coverage_pct: number } {
  const total = dates.length;
  if (total === 0) return { spread_days: null, coverage_pct: 0 };

  const valid = dates.filter((d): d is Date => d !== null);
  const coverage_pct = Math.round((valid.length / total) * 1000) / 10;

  if (coverage_pct < 70 || valid.length < 2) {
    return { spread_days: null, coverage_pct };
  }

  const timestamps = valid.map((d) => d.getTime());
  const spread_ms = Math.max(...timestamps) - Math.min(...timestamps);
  const spread_days = Math.round(spread_ms / (1000 * 60 * 60 * 24));

  return { spread_days, coverage_pct };
}
