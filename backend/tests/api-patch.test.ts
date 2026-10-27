import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "@/app";
import { templateDefaults } from "@resume/shared/render/templates";
import { useTestDb } from "./helpers";

const app = createApp();

beforeEach(async () => {
  await useTestDb();
});

describe("partial request bodies", () => {
  it("a template chosen at creation keeps its own fonts and colour", async () => {
    const a = request.agent(app);
    await a.post("/api/auth/register").send({ email: "patch1@example.com", password: "a good password 1", fullName: "Test User", phone: "+91 98765 43210" });
    const r = (await a.post("/api/resumes").send({ name: "R", settings: { template: "elegant", pageSize: "LETTER" } })).body.resume;
    const want = templateDefaults("elegant");
    expect(r.settings).toMatchObject({ template: "elegant", fontFamily: want.fontFamily, headingFont: want.headingFont, accentColor: want.accentColor, pageSize: "LETTER" });
  });
});
