const { verifyToken, isPublicRenewAdobePath } = require("../../../src/middleware/csrfProtection");

describe("csrfProtection public renew-adobe", () => {
  it("isPublicRenewAdobePath matches storefront OTP route", () => {
    expect(
      isPublicRenewAdobePath({
        path: "/renew-adobe/public/otp",
        originalUrl: "/api/renew-adobe/public/otp",
      })
    ).toBe(true);
  });

  it("verifyToken skips CSRF for public OTP POST", () => {
    const req = {
      method: "POST",
      path: "/renew-adobe/public/otp",
      originalUrl: "/api/renew-adobe/public/otp",
      headers: {},
      body: {},
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    verifyToken(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
