const sharp = require("sharp");

/** Max longest side; keeps layout sane for blog without huge files */
const MAX_SIDE = 1680;
/** Balanced: smaller files while limiting visible banding vs very low quality */
const WEBP_QUALITY = 76;
const WEBP_EFFORT = 6;
/** Higher = better edge on transparency */
const WEBP_ALPHA_QUALITY = 94;

/**
 * Resize (if needed) and encode as WebP for article embeds.
 * @param {Buffer} buffer
 * @returns {Promise<Buffer>}
 */
async function compressArticleImageToWebp(buffer) {
  const pipeline = sharp(buffer, { failOn: "warning" });
  const meta = await pipeline.metadata();

  if (!meta.width || !meta.height) {
    throw new Error("Không đọc được kích thước ảnh.");
  }

  let img = pipeline.rotate();

  if (meta.width > MAX_SIDE || meta.height > MAX_SIDE) {
    img = img.resize(MAX_SIDE, MAX_SIDE, {
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  const hasAlpha = Boolean(meta.hasAlpha);

  return img
    .webp({
      quality: WEBP_QUALITY,
      effort: WEBP_EFFORT,
      alphaQuality: hasAlpha ? WEBP_ALPHA_QUALITY : undefined,
      // false = less aggressive chroma subsampling → colors hold up better at a given quality
      smartSubsample: false,
    })
    .toBuffer();
}

module.exports = {
  compressArticleImageToWebp,
};
