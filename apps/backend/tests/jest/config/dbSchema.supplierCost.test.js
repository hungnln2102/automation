/**
 * Test supplier_cost config: column must be variant_id (not product_id).
 */
const { getDefinition, PARTNER_SCHEMA } = require("../../../src/config/dbSchema");

describe("dbSchema supplier_cost", () => {
  it("SUPPLIER_COST uses variant_id column", () => {
    const def = getDefinition("SUPPLIER_COST", PARTNER_SCHEMA);
    expect(def).not.toBeNull();
    expect(def.tableName).toBe("supplier_cost");
    expect(def.columns.variantId).toBe("variant_id");
    expect(def.columns.productId).toBeUndefined();
  });

  it("PARTNER_SCHEMA.SUPPLIER_COST.COLS has VARIANT_ID", () => {
    const cols = PARTNER_SCHEMA.SUPPLIER_COST.COLS;
    expect(cols.VARIANT_ID).toBe("variant_id");
    expect(cols.PRODUCT_ID).toBeUndefined();
  });
});
