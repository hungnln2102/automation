const {
  buildWebsiteStatusPayload,
} = require("../../src/controllers/RenewAdobeController/statusUtils");

describe("renew-adobe website status payload", () => {
  const activeOrder = {
    order_code: "MAVL123",
    expiry_date: "2026-04-16",
    status: "Đã Thanh Toán",
  };

  it("returns active when order is valid and assigned account is usable", () => {
    const payload = buildWebsiteStatusPayload({
      email: "hungnlin2102@gmail.com",
      order: activeOrder,
      account: {
        id: 1,
        email: "admin@example.com",
        org_name: "Pasquale Wiener",
        license_status: "Paid",
        user_count: 1,
        is_active: true,
      },
      matchedUser: {
        email: "hungnlin2102@gmail.com",
        product: true,
      },
      now: new Date("2026-04-02T00:00:00.000Z"),
    });

    expect(payload.status).toBe("active");
    expect(payload.canActivate).toBe(false);
    expect(payload.profileName).toBe("Pasquale Wiener");
  });

  it("returns needs_activation when order is valid but account is missing", () => {
    const payload = buildWebsiteStatusPayload({
      email: "hungnlin2102@gmail.com",
      order: activeOrder,
      account: null,
      matchedUser: null,
      now: new Date("2026-04-02T00:00:00.000Z"),
    });

    expect(payload.status).toBe("needs_activation");
    expect(payload.canActivate).toBe(true);
  });

  it("returns active when matched user has no product but order and admin license ok (url access flow)", () => {
    const payload = buildWebsiteStatusPayload({
      email: "hungnlin2102@gmail.com",
      order: activeOrder,
      account: {
        id: 1,
        email: "admin@example.com",
        org_name: "Pasquale Wiener",
        license_status: "Paid",
        user_count: 1,
        is_active: true,
        url_access: "https://adminconsole.adobe.com/invite/example",
      },
      matchedUser: {
        email: "hungnlin2102@gmail.com",
        product: false,
      },
      now: new Date("2026-04-02T00:00:00.000Z"),
    });

    expect(payload.status).toBe("active");
    expect(payload.canActivate).toBe(false);
    expect(payload.account?.userHasProduct).toBe(false);
    expect(payload.account?.urlAccess).toBe(
      "https://adminconsole.adobe.com/invite/example",
    );
    expect(payload.message).toContain("liên kết");
  });

  it("returns order_expired when order is past expiry", () => {
    const payload = buildWebsiteStatusPayload({
      email: "hungnlin2102@gmail.com",
      order: {
        ...activeOrder,
        expiry_date: "2026-04-01",
      },
      account: null,
      matchedUser: null,
      now: new Date("2026-04-02T00:00:00.000Z"),
    });

    expect(payload.status).toBe("order_expired");
    expect(payload.canActivate).toBe(false);
    expect(payload.message).toContain("01/04/2026");
  });

  it("returns no_order when there is no renew order", () => {
    const payload = buildWebsiteStatusPayload({
      email: "hungnlin2102@gmail.com",
      order: null,
      account: {
        id: 1,
        email: "admin@example.com",
        org_name: "Pasquale Wiener",
        license_status: "Paid",
        user_count: 1,
        is_active: true,
      },
      matchedUser: {
        email: "hungnlin2102@gmail.com",
        product: true,
      },
      now: new Date("2026-04-02T00:00:00.000Z"),
    });

    expect(payload.status).toBe("no_order");
    expect(payload.canActivate).toBe(false);
  });
});
