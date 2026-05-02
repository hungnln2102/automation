const {
  extractProductsListQueryFromRequestUrl,
  PRODUCTS_LIST_QUERY_MANAGE_TEAM,
} = require("../../../../../src/services/renew-adobe/adobe-renew-v2/shared/orgProductsApi");

describe("orgProductsApi JIL products query", () => {
  it("PRODUCTS_LIST_QUERY_MANAGE_TEAM khớp contract manage-team (includeFulfillableItemCodesOnly + administration)", () => {
    expect(PRODUCTS_LIST_QUERY_MANAGE_TEAM).toContain("includeFulfillableItemCodesOnly=true");
    expect(PRODUCTS_LIST_QUERY_MANAGE_TEAM).toContain("include_legacy_ls_fields=true");
    expect(PRODUCTS_LIST_QUERY_MANAGE_TEAM).toContain("processing_instruction_codes=administration");
    expect(PRODUCTS_LIST_QUERY_MANAGE_TEAM).toContain("include_pricing_data=false");
  });

  it("extractProductsListQueryFromRequestUrl lấy đúng ?… từ URL request bps-il", () => {
    const u =
      "https://bps-il.adobe.io/jil-api/v2/organizations/E8E327CF69DD49EF0A495F90%40AdobeOrg/products" +
      "?include_created_date=true&processing_instruction_codes=administration";
    expect(extractProductsListQueryFromRequestUrl(u)).toBe(
      "?include_created_date=true&processing_instruction_codes=administration"
    );
  });
});
