/**
 * Fixture Jest — **không** phải id gán cho tài khoản thật.
 * Runtime: `fetchVerifiedCcpSeatProductIdsFromOrgProductsApi` / users API đọc `productId` từ Adobe theo từng org.
 * Ở đây chỉ mô phỏng shape JSON (id nội bộ vs productId fulfillable) để kiểm tra `extractProductId` / lọc CCP.
 */
const { extractCcpSeatProductIdsFromOrgProductsList } = require("../shared/accessChecks");
const { extractAbpUserProductRefs, mapAbpUserToSnapshotUser } = require("../shared/usersListApi");

/** Hex 20 ký tự giả — đại diện mã fulfillable CCP từ API (mỗi org một bộ id thật). */
const FIXTURE_CCP_PRODUCT_ID = "F00DC0C0C0DE00000001";
/** Hex 20 ký tự giả — gói member trong cùng payload giả lập. */
const FIXTURE_MEMBER_PRODUCT_ID = "F00DFEEDBEEF00000002";

describe("JIL products API (longName) → CCP id", () => {
  it("chỉ lấy id Creative Cloud Pro, bỏ gói thành viên miễn phí", () => {
    const list = [
      { id: FIXTURE_CCP_PRODUCT_ID, longName: "Creative Cloud Pro" },
      {
        id: FIXTURE_MEMBER_PRODUCT_ID,
        longName: "Gói thành viên miễn phí dành cho nhóm",
      },
    ];
    const ids = extractCcpSeatProductIdsFromOrgProductsList(list);
    expect(ids).toEqual([FIXTURE_CCP_PRODUCT_ID]);
  });

  it("bỏ id số nội bộ JIL (1, 2), lấy productId fulfillable để khớp user", () => {
    const list = [
      {
        id: 1,
        productId: FIXTURE_CCP_PRODUCT_ID,
        longName: "Creative Cloud Pro",
      },
      {
        id: "2",
        productId: FIXTURE_MEMBER_PRODUCT_ID,
        longName: "Gói thành viên miễn phí dành cho nhóm",
      },
    ];
    const ids = extractCcpSeatProductIdsFromOrgProductsList(list);
    expect(ids).toEqual([FIXTURE_CCP_PRODUCT_ID]);
  });

  it("ưu tiên JIL id (arrangement) thay vì offerId để khớp productAssignments.productId", () => {
    const arrangementId = "EEE93E34A537E93AFD7A";
    const offerId = "DAC628518DDD843D4D19A8BF7D8FF1FE";
    const list = [
      {
        id: arrangementId,
        offerId,
        longName: "Creative Cloud Pro",
      },
    ];
    const ids = extractCcpSeatProductIdsFromOrgProductsList(list);
    expect(ids).toEqual([arrangementId.toUpperCase()]);
  });
});

describe("ABP users → productIds", () => {
  it("đọc resources[].productId", () => {
    const refs = extractAbpUserProductRefs({
      username: "a@x.com",
      resources: [{ productId: FIXTURE_CCP_PRODUCT_ID }],
    });
    expect(refs.map((r) => r.id)).toEqual([FIXTURE_CCP_PRODUCT_ID]);
  });

  it("đọc productAssignments trên account", () => {
    const refs = extractAbpUserProductRefs({
      username: "b@x.com",
      account: {
        productAssignments: [{ productId: "P1" }],
      },
    });
    expect(refs.map((r) => r.id)).toEqual(["P1"]);
  });

  it("map snapshot user có email và products", () => {
    const u = mapAbpUserToSnapshotUser({
      id: "u1",
      username: "fixture.user@example.com",
      resources: [{ productId: FIXTURE_CCP_PRODUCT_ID }],
    });
    expect(u.email).toBe("fixture.user@example.com");
    expect(u.products.map((p) => p.id)).toEqual([FIXTURE_CCP_PRODUCT_ID]);
  });
});
