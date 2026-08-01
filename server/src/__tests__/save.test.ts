import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";

import { createTestApp, registerUser, sampleState, type TestContext } from "./testApp.js";

let ctx: TestContext;
let token: string;

beforeEach(async () => {
  ctx = createTestApp();
  token = await registerUser(ctx.app);
});

afterEach(() => {
  ctx.close();
});

const auth = () => ({ authorization: `Bearer ${token}` });

describe("GET /api/save", () => {
  it("returns 204 when the player has no save yet", async () => {
    const res = await request(ctx.app).get("/api/save").set(auth());

    expect(res.status).toBe(204);
  });

  it("requires authentication", async () => {
    expect((await request(ctx.app).get("/api/save")).status).toBe(401);
  });
});

describe("PUT /api/save", () => {
  it("stores the first save at version 1 and reads it back", async () => {
    const state = sampleState();

    const put = await request(ctx.app).put("/api/save").set(auth()).send({ state, baseVersion: 0 });
    expect(put.status).toBe(200);
    expect(put.body).toEqual({ saveVersion: 1 });

    const get = await request(ctx.app).get("/api/save").set(auth());
    expect(get.status).toBe(200);
    expect(get.body.saveVersion).toBe(1);
    expect(get.body.state).toEqual(state);
  });

  it("bumps saveVersion on each accepted write", async () => {
    const state = sampleState();
    await request(ctx.app).put("/api/save").set(auth()).send({ state, baseVersion: 0 });

    const second = await request(ctx.app)
      .put("/api/save")
      .set(auth())
      .send({ state, baseVersion: 1 });

    expect(second.body).toEqual({ saveVersion: 2 });
  });

  it("returns 409 with the server state when baseVersion is stale", async () => {
    const first = sampleState();
    await request(ctx.app).put("/api/save").set(auth()).send({ state: first, baseVersion: 0 });

    const newer = sampleState({ lastTickAt: first.lastTickAt + 60_000 });
    await request(ctx.app).put("/api/save").set(auth()).send({ state: newer, baseVersion: 1 });

    // A second device still thinks the server is at version 1.
    const stale = await request(ctx.app)
      .put("/api/save")
      .set(auth())
      .send({ state: first, baseVersion: 1 });

    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("SAVE_CONFLICT");
    expect(stale.body.saveVersion).toBe(2);
    expect(stale.body.serverState).toEqual(newer);

    // The conflicting write must not have landed.
    const get = await request(ctx.app).get("/api/save").set(auth());
    expect(get.body.state).toEqual(newer);
  });

  it("rejects a malformed GameState", async () => {
    const res = await request(ctx.app)
      .put("/api/save")
      .set(auth())
      .send({ state: { saveVersion: 1, nonsense: true }, baseVersion: 0 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_BODY");
  });

  it("rejects a save timestamped implausibly far in the future", async () => {
    const res = await request(ctx.app)
      .put("/api/save")
      .set(auth())
      .send({ state: sampleState({ lastTickAt: Date.now() + 60 * 60_000 }), baseVersion: 0 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("IMPLAUSIBLE_TIMESTAMP");
  });

  it("keeps players' saves separate", async () => {
    const mine = sampleState();
    await request(ctx.app).put("/api/save").set(auth()).send({ state: mine, baseVersion: 0 });

    const otherToken = await registerUser(ctx.app, "mama", "jellybean2");
    const theirs = await request(ctx.app)
      .get("/api/save")
      .set({ authorization: `Bearer ${otherToken}` });

    expect(theirs.status).toBe(204);
  });

  it("requires authentication", async () => {
    const res = await request(ctx.app).put("/api/save").send({ state: sampleState(), baseVersion: 0 });

    expect(res.status).toBe(401);
  });
});
