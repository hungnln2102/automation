const request = require("supertest");

jest.mock("../../src/routes", () => {
  const express = require("express");
  return express.Router();
});

const app = require("../../src/app");

describe("GET /api", () => {
  it("should return ok: true", async () => {
    const res = await request(app).get("/api");
    expect(res.statusCode).toEqual(200);
    expect(res.body.ok).toEqual(true);
  });
});
