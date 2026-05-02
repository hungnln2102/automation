const { needsUsersPageRecovery } = require("../checkInfoFlow");

describe("checkInfoFlow needsUsersPageRecovery", () => {
  it("returns false for users path (org-scoped)", () => {
    expect(
      needsUsersPageRecovery(
        "https://adminconsole.adobe.com/abc123def45678901234@AdobeOrg/users"
      )
    ).toBe(false);
  });

  it("returns true when stuck on global /products without @AdobeOrg", () => {
    expect(needsUsersPageRecovery("https://adminconsole.adobe.com/products")).toBe(true);
  });

  it("returns true for org-scoped non-users route", () => {
    expect(
      needsUsersPageRecovery(
        "https://adminconsole.adobe.com/abc123def45678901234@AdobeOrg/products"
      )
    ).toBe(true);
  });

  it("returns false for non-adminconsole URL", () => {
    expect(needsUsersPageRecovery("https://example.com/products")).toBe(false);
  });
});
