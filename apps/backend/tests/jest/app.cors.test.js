const request = require("supertest");

describe("app CORS", () => {
  const originalFrontendOrigins = process.env.FRONTEND_ORIGINS;

  afterEach(() => {
    jest.resetModules();
    jest.unmock("../../src/routes");

    if (typeof originalFrontendOrigins === "string") {
      process.env.FRONTEND_ORIGINS = originalFrontendOrigins;
      return;
    }

    delete process.env.FRONTEND_ORIGINS;
  });

  it("allows configured production website origin", async () => {
    process.env.FRONTEND_ORIGINS =
      "http://localhost:5173,https://admin.mavrykpremium.store,https://www.mavrykpremium.store";

    jest.doMock("../../src/routes", () => {
      const express = require("express");
      return express.Router();
    });

    const app = require("../../src/app");
    const response = await request(app)
      .get("/api")
      .set("Origin", "https://www.mavrykpremium.store");

    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe(
      "https://www.mavrykpremium.store"
    );
  });
});
