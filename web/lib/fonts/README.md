# Print fonts (subset static TTFs)

These are the source artifacts for the base64 blobs in `web/lib/book/font-data.ts`,
which the PDF template embeds via `@font-face` data-URIs.

## Why these exist / why TTF + static + subset

The Modal PDF renderer is headless Chromium. Empirically:

- **Chromium does NOT embed woff2 data-URI `@font-face` fonts** into the exported
  PDF (they load and display, but print in fallback). **TTF data-URIs DO embed.**
- **Chromium does NOT embed variable fonts** served to it; **static instances DO.**

So the print fonts must be **static, TTF, and referenced as `data:font/ttf` +
`format('truetype')`**. They are **subset** to keep the base64 payload small
(~340 KB total for 8 faces vs. ~1.9 MB un-subset).

The digital path (real browsers) embeds data-URI fonts fine; this same TTF set
is used for both — there is no print/digital divergence in the template.

## Faces

| File | Family | Weight | Style |
|------|--------|--------|-------|
| `Nunito-400.ttf` | Nunito | 400 | normal |
| `Nunito-600.ttf` | Nunito | 600 | normal |
| `Nunito-700.ttf` | Nunito | 700 | normal |
| `Nunito-400-Italic.ttf` | Nunito | 400 | italic |
| `Nunito-600-Italic.ttf` | Nunito | 600 | italic |
| `Gelasio-400.ttf` | Gelasio | 400 | normal |
| `Gelasio-700.ttf` | Gelasio | 700 | normal |
| `Gelasio-400-Italic.ttf` | Gelasio | 400 | italic |

Gelasio is Google's metrics-compatible Georgia replacement; the template's serif
stack is `'Gelasio', Georgia, serif` so print (Gelasio) matches the on-screen
(Georgia) look. Nunito is the sans/body face.

## Subset ranges

Basic Latin `U+0020–007E`, Latin-1 Supplement `U+00A0–00FF`, General Punctuation
`U+2000–206F` (curly quotes, en/em dashes, middle dot, bullet, daggers, …), and
Latin ligatures `U+FB00–FB06`. This deliberately excludes `U+2767 ❧` — the old
flourish ornament, now replaced by `·` (U+00B7, in range).

## Regenerate

Source: **`google/fonts` @ commit `e4572de925a4c3be12f1f9983ee0adbe1eb6e9fe`**
(variable-font sources; no static instances are published upstream).

```sh
SHA=e4572de925a4c3be12f1f9983ee0adbe1eb6e9fe
BASE="https://raw.githubusercontent.com/google/fonts/$SHA"
curl -sSo Nunito.ttf         "$BASE/ofl/nunito/Nunito%5Bwght%5D.ttf"
curl -sSo Nunito-Italic.ttf  "$BASE/ofl/nunito/Nunito-Italic%5Bwght%5D.ttf"
curl -sSo Gelasio.ttf        "$BASE/ofl/gelasio/Gelasio%5Bwght%5D.ttf"
curl -sSo Gelasio-Italic.ttf "$BASE/ofl/gelasio/Gelasio-Italic%5Bwght%5D.ttf"

# instance each weight (fonttools varLib.instancer, updateFontNames=True), e.g.:
#   fonttools varLib.instancer Nunito.ttf wght=600 -o Nunito-600.ttf --update-name-table
# then subset each instance to the ranges above:
UNI="0020-007E,00A0-00FF,2000-206F,FB00-FB06"
fonttools subset Nunito-600.ttf --unicodes=$UNI --output-file=Nunito-600.ttf \
  --glyph-names --notdef-outline --desubroutinize

# finally base64 each subset TTF into web/lib/book/font-data.ts (see that file's header).
```

## License

Both families: **SIL Open Font License 1.1** — see `OFL-Nunito.txt`,
`OFL-Gelasio.txt` (full text + per-family copyright).
