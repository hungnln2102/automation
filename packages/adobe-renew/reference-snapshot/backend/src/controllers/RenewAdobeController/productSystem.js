const { db } = require("../../db");
const {
  SCHEMA_RENEW_ADOBE,
  SCHEMA_PRODUCT,
  RENEW_ADOBE_SCHEMA,
  PRODUCT_SCHEMA,
  tableName,
} = require("../../config/dbSchema");
const logger = require("../../utils/logger");

const PS_TABLE = tableName(
  RENEW_ADOBE_SCHEMA.PRODUCT_SYSTEM.TABLE,
  SCHEMA_RENEW_ADOBE
);
const PS_COLS = RENEW_ADOBE_SCHEMA.PRODUCT_SYSTEM.COLS;

const VARIANT_TABLE = tableName(PRODUCT_SCHEMA.VARIANT.TABLE, SCHEMA_PRODUCT);
const VARIANT_COLS = PRODUCT_SCHEMA.VARIANT.COLS;

const listVariants = async (_req, res) => {
  try {
    const rows = await db(VARIANT_TABLE)
      .select(VARIANT_COLS.ID, VARIANT_COLS.DISPLAY_NAME)
      .where(VARIANT_COLS.IS_ACTIVE, true)
      .orderBy(VARIANT_COLS.DISPLAY_NAME, "asc");

    return res.json(
      rows.map((row) => ({
        id: row[VARIANT_COLS.ID],
        display_name: row[VARIANT_COLS.DISPLAY_NAME] ?? "",
      }))
    );
  } catch (err) {
    logger.error("[renew-adobe] listVariants failed", { error: err.message });
    return res.status(500).json({ error: err.message });
  }
};

const listProductSystem = async (_req, res) => {
  try {
    const rows = await db(PS_TABLE)
      .select(
        PS_COLS.ID,
        PS_COLS.VARIANT_ID,
        PS_COLS.SYSTEM_CODE,
        PS_COLS.CREATED_AT
      )
      .orderBy(PS_COLS.ID, "asc");

    return res.json(rows);
  } catch (err) {
    logger.error("[renew-adobe] listProductSystem failed", {
      error: err.message,
    });
    return res.status(500).json({ error: err.message });
  }
};

const createProductSystem = async (req, res) => {
  const variantId =
    req.body?.variant_id != null ? Number(req.body.variant_id) : null;
  const systemCode =
    (req.body?.system_code && String(req.body.system_code).trim()) || null;

  if (variantId == null || variantId <= 0 || !systemCode) {
    return res.status(400).json({
      error: "Cần variant_id (số nguyên > 0) và system_code (chuỗi không rỗng)",
    });
  }

  try {
    const [row] = await db(PS_TABLE)
      .insert({
        [PS_COLS.VARIANT_ID]: variantId,
        [PS_COLS.SYSTEM_CODE]: systemCode,
      })
      .returning([
        PS_COLS.ID,
        PS_COLS.VARIANT_ID,
        PS_COLS.SYSTEM_CODE,
        PS_COLS.CREATED_AT,
      ]);

    return res.status(201).json(
      row || {
        id: null,
        variant_id: variantId,
        system_code: systemCode,
        created_at: new Date().toISOString(),
      }
    );
  } catch (err) {
    if (err.code === "23505") {
      return res
        .status(409)
        .json({ error: "Cặp variant_id + system_code đã tồn tại" });
    }

    logger.error("[renew-adobe] createProductSystem failed", {
      error: err.message,
    });
    return res.status(500).json({ error: err.message });
  }
};

const deleteProductSystem = async (req, res) => {
  const id = Number(req.params.id);

  if (!id || id <= 0) {
    return res.status(400).json({ error: "id không hợp lệ" });
  }

  try {
    const deleted = await db(PS_TABLE).where(PS_COLS.ID, id).del();

    if (deleted === 0) {
      return res.status(404).json({ error: "Không tìm thấy bản ghi" });
    }

    return res.json({ success: true });
  } catch (err) {
    logger.error("[renew-adobe] deleteProductSystem failed", {
      error: err.message,
    });
    return res.status(500).json({ error: err.message });
  }
};

module.exports = {
  listVariants,
  listProductSystem,
  createProductSystem,
  deleteProductSystem,
};
