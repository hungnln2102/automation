const { pickOtpFromDongvanMessages } = require("../../../src/services/dongvan/dongvanOtpService");

describe("dongvanOtpService.pickOtpFromDongvanMessages", () => {
  it("returns latest Adobe OTP code from messages", () => {
    const code = pickOtpFromDongvanMessages(
      [
        {
          date: "2022-04-16T01:23:43.000Z",
          from: [{ address: "no-reply@microsoft.com" }],
          subject: "Welcome",
          code: "",
        },
        {
          date: "2022-04-18T11:35:26.000Z",
          from: [{ address: "security@adobe.com" }],
          subject: "Adobe verification code",
          code: "56924",
        },
      ],
      { senderFilter: "adobe" }
    );
    expect(code).toBe("56924");
  });

  it("extracts code from verification email body when code column is empty", () => {
    const code = pickOtpFromDongvanMessages(
      [
        {
          date: "01:24 - 02/06/2026",
          from: [{ address: "message@adobe.com" }],
          subject: "Verification code",
          code: "",
          message:
            "Your account can't be accessed without this verification code. Your Adobe verification code is 95110.",
        },
      ],
      { senderFilter: "adobe", requireVerification: true }
    );
    expect(code).toBe("95110");
  });

  it("ignores marketing mail when requireVerification is true", () => {
    const code = pickOtpFromDongvanMessages(
      [
        {
          date: "11:15 - 29/05/2026",
          from: [{ address: "mail@e.adobe.com" }],
          subject: "Tips and techniques",
          message: "Create eye-catching content for free",
        },
        {
          date: "01:24 - 02/06/2026",
          from: [{ address: "message@adobe.com" }],
          subject: "Verification code",
          message: "Your Adobe verification code is 123456.",
        },
      ],
      { senderFilter: "adobe", requireVerification: true }
    );
    expect(code).toBe("123456");
  });

  it("ignores messages older than minTimestampMs", () => {
    const code = pickOtpFromDongvanMessages(
      [
        {
          date: "2022-04-18T11:35:26.000Z",
          from: [{ address: "security@adobe.com" }],
          code: "11111",
        },
      ],
      { senderFilter: "adobe", minTimestampMs: Date.parse("2022-04-19T00:00:00.000Z") }
    );
    expect(code).toBeNull();
  });

  it("parses DongVan local date format before applying freshness filter", () => {
    const code = pickOtpFromDongvanMessages(
      [
        {
          date: "09:43 - 16/05/2026",
          from: [{ address: "message@adobe.com" }],
          subject: "Verification code",
          message: "Your Adobe verification code is 95110.",
        },
      ],
      {
        senderFilter: "adobe",
        minTimestampMs: Date.parse("2026-06-01T16:21:31.924Z"),
      }
    );
    expect(code).toBeNull();
  });

  it("skips undated messages when a freshness filter is required", () => {
    const code = pickOtpFromDongvanMessages(
      [
        {
          date: "not a parseable date",
          from: [{ address: "message@adobe.com" }],
          subject: "Verification code",
          message: "Your Adobe verification code is 95110.",
        },
      ],
      {
        senderFilter: "adobe",
        minTimestampMs: Date.parse("2026-06-01T16:21:31.924Z"),
      }
    );
    expect(code).toBeNull();
  });
});
