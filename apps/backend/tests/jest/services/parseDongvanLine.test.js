const {
  parseDongvanLine,
  resolveDongvanOAuthInput,
  resolveDongvanOAuthFromBody,
} = require("../../../src/services/dongvan/parseDongvanLine");

const SAMPLE_LINE =
  "jamarimanningtnun@outlook.com|TKgFmZLcX1|x1WGpj4LdaF#|M.C528_SN1.0.U.-Ctu3*C4cp1FOmehxMz1IoR4TCmV0G9pEUJ640wBRNhsGpyuAsMDc1KhRE33Ameebp7Sx6N*xn9vgqUarrrRAGU40b9hyzoh9rsVdbSiKu9CeMB6AtybpD0qoz4mIU1MaHC4rV55B8UFB4pNwKkuV3XB!vjweC9E5Jvcv8eCaF3mLkXpW8lXWJtl4FJ4DAqev50owSbtsS2VdLZZ6tIfNyp!FGkd69J8FiiY!vkAl0Sp2fS3uBIrak9CcYAOFDiftt1*5!*a9OHcAGI6YdBSKwY8uTiv2JHFsi9Hz0f5911A6qsw4Fb1Ckj4le4ehye8Tw9aaRq1qlt3M4PDcKjcIYDAAiaeDdM!ojZCrjkXzF3gAJdUYC1Yzb4k7U3dE9!sXv!AKrJGKSO63spJ9IjGavA2TEpY2hBO9CJqm9IRi3SGrWoZXBpzla8mCuDC7x6VRfQ$$|9e5f94bc-e8a4-4e73-b8be-63364c29d753";

describe("parseDongvanLine", () => {
  it("parses full buy-mail line", () => {
    const parsed = parseDongvanLine(SAMPLE_LINE);
    expect(parsed).toEqual({
      mailEmail: "jamarimanningtnun@outlook.com",
      mailPassword: "TKgFmZLcX1",
      refreshToken: expect.stringMatching(/^M\.C528_/),
      clientId: "9e5f94bc-e8a4-4e73-b8be-63364c29d753",
    });
  });

  it("parses oauth2 token|client_id only", () => {
    const parsed = parseDongvanLine(
      "M.C528_shorttoken|9e5f94bc-e8a4-4e73-b8be-63364c29d753".replace(
        "shorttoken",
        "SN1.0.U.-Ctu3*C4cp1FOmehxMz1IoR4TCmV0G9pEUJ640wBRNhsGpyuAsMDc1KhRE33Ameebp7Sx6N"
      )
    );
    expect(parsed?.clientId).toBe("9e5f94bc-e8a4-4e73-b8be-63364c29d753");
    expect(parsed?.refreshToken).toMatch(/^M\.C528_/);
  });

  it("resolveDongvanOAuthInput accepts pasted full line in refresh field", () => {
    const resolved = resolveDongvanOAuthInput(SAMPLE_LINE, "");
    expect(resolved.clientId).toBe("9e5f94bc-e8a4-4e73-b8be-63364c29d753");
    expect(resolved.refreshToken).toMatch(/^M\.C528_/);
  });

  it("resolveDongvanOAuthFromBody reads dongvan_line", () => {
    const resolved = resolveDongvanOAuthFromBody({ dongvan_line: SAMPLE_LINE });
    expect(resolved.clientId).toBe("9e5f94bc-e8a4-4e73-b8be-63364c29d753");
    expect(resolved.refreshToken).toMatch(/^M\.C528_/);
    expect(resolved.mailEmail).toBe("jamarimanningtnun@outlook.com");
  });
});
