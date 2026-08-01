import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";

import { createTestApp, registerUser, type TestContext } from "./testApp.js";

let ctx: TestContext;

beforeEach(() => {
  ctx = createTestApp();
});

afterEach(() => {
  ctx.close();
});

describe("POST /api/auth/register", () => {
  it("creates an account and returns a token", async () => {
    const res = await request(ctx.app)
      .post("/api/auth/register")
      .send({ username: "papa", password: "jellybean1" });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ username: "papa" });
    expect(typeof res.body.token).toBe("string");
  });

  it("rejects a duplicate username", async () => {
    await registerUser(ctx.app);
    const res = await request(ctx.app)
      .post("/api/auth/register")
      .send({ username: "papa", password: "differentpw" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("USERNAME_TAKEN");
  });

  it("enforces the shared password rules", async () => {
    const res = await request(ctx.app)
      .post("/api/auth/register")
      .send({ username: "papa", password: "short" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_BODY");
  });

  it("never returns the password hash", async () => {
    const res = await request(ctx.app)
      .post("/api/auth/register")
      .send({ username: "papa", password: "jellybean1" });

    expect(JSON.stringify(res.body)).not.toContain("$2b$");
  });
});

describe("POST /api/auth/login", () => {
  it("returns a token for good credentials", async () => {
    await registerUser(ctx.app);
    const res = await request(ctx.app)
      .post("/api/auth/login")
      .send({ username: "papa", password: "jellybean1" });

    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe("string");
  });

  it("rejects a wrong password", async () => {
    await registerUser(ctx.app);
    const res = await request(ctx.app)
      .post("/api/auth/login")
      .send({ username: "papa", password: "wrongpassword" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("rejects an unknown user with the same error", async () => {
    const res = await request(ctx.app)
      .post("/api/auth/login")
      .send({ username: "nobody", password: "jellybean1" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });
});

describe("GET /api/auth/me", () => {
  it("returns the signed-in user", async () => {
    const token = await registerUser(ctx.app);
    const res = await request(ctx.app).get("/api/auth/me").set("authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ username: "papa" });
  });

  it("rejects a missing token", async () => {
    const res = await request(ctx.app).get("/api/auth/me");

    expect(res.status).toBe(401);
  });

  it("rejects a garbage token", async () => {
    const res = await request(ctx.app)
      .get("/api/auth/me")
      .set("authorization", "Bearer not-a-real-token");

    expect(res.status).toBe(401);
  });
});
