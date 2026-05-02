const {
  isCcpLikeProduct,
  isNonProMembershipProduct,
  hasAdobeProAccessFromProducts,
  discoverAdobeProProductIdSet,
  checkUserAssignedProduct,
  resolveAuthoritativeCcpProductIdSet,
} = require("../shared/accessChecks");

describe("accessChecks CCP vs Member (free)", () => {
  it("treats Vietnamese free membership product as not CCP", () => {
    const p = { id: "OFFER123", name: "Gói thành viên miễn phí" };
    expect(isNonProMembershipProduct(p)).toBe(true);
    expect(isCcpLikeProduct(p)).toBe(false);
  });

  it("treats Creative Cloud Pro by name as CCP", () => {
    const p = { id: "ABC", name: "Creative Cloud Pro" };
    expect(isCcpLikeProduct(p)).toBe(true);
  });

  it("does not infer CCP from id-only products shared by many users (Member seat)", () => {
    const users = [
      { email: "a@x.com", products: [{ id: "SHARED_ID" }] },
      { email: "b@x.com", products: [{ id: "SHARED_ID" }] },
      { email: "c@x.com", products: [{ id: "SHARED_ID" }] },
    ];
    const ids = discoverAdobeProProductIdSet(users, "a@x.com");
    expect([...ids]).toEqual([]);
    expect(hasAdobeProAccessFromProducts([{ id: "SHARED_ID" }], ids)).toBe(false);
  });

  it("when pinned id matches but API name is free member, deny access (stale wrong pin)", () => {
    const pinned = new Set(["WRONG_PINNED"]);
    const products = [
      { id: "WRONG_PINNED", displayName: "Gói thành viên miễn phí" },
    ];
    expect(
      hasAdobeProAccessFromProducts(products, pinned, { strictIdOnly: true })
    ).toBe(false);
  });

  it("checkUserAssignedProduct is false for team user with only free membership", () => {
    const users = [
      {
        email: "admin@co.com",
        products: [
          { id: "P1", name: "Creative Cloud Pro" },
          { id: "M1", name: "Gói thành viên miễn phí" },
        ],
      },
      {
        email: "member@co.com",
        products: [{ id: "M1", name: "Gói thành viên miễn phí" }],
      },
    ];
    const pinned = discoverAdobeProProductIdSet(users, "admin@co.com");
    expect(pinned.has("P1")).toBe(true);
    const r = checkUserAssignedProduct(users, "member@co.com", "admin@co.com", [...pinned]);
    expect(r.assigned).toBe(false);
  });

  it("checkUserAssignedProduct is true when user has Creative Cloud Pro product", () => {
    const users = [
      {
        email: "u@co.com",
        products: [{ id: "P1", name: "Creative Cloud Pro" }],
      },
    ];
    const pinned = ["P1"];
    const r = checkUserAssignedProduct(users, "u@co.com", "u@co.com", pinned);
    expect(r.assigned).toBe(true);
  });

  it("verifiedCcpSeatProductIds from products API wins over stale DB pin", () => {
    const users = [
      {
        email: "u@co.com",
        products: [{ id: "REAL_CCP", name: "Creative Cloud Pro" }],
      },
    ];
    const r = checkUserAssignedProduct(users, "u@co.com", "u@co.com", ["OLD_PIN"], {
      verifiedCcpSeatProductIds: ["REAL_CCP"],
    });
    expect(r.assigned).toBe(true);
    const { idSet, authoritativeOnly } = resolveAuthoritativeCcpProductIdSet({
      verifiedFromProductsApi: ["REAL_CCP"],
      pinnedProductIds: ["OLD_PIN"],
      users,
      adminEmail: "u@co.com",
    });
    expect(authoritativeOnly).toBe(true);
    expect(idSet.has("REAL_CCP")).toBe(true);
    expect(idSet.has("OLD_PIN")).toBe(false);
  });
});
