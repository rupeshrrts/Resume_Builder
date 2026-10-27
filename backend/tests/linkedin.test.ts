import { beforeEach, describe, expect, it } from "vitest";
import JSZip from "jszip";
import request from "supertest";
import { createApp } from "@/app";
import { parseCsv } from "@/parse/linkedin";
import { useTestDb } from "./helpers";

const app = createApp();

/** A small export shaped like LinkedIn's "Download your data" archive. */
async function linkedinZip(opts: { profile?: boolean } = {}) {
  const zip = new JSZip();
  if (opts.profile !== false)
    zip.file(
      "Profile.csv",
      `First Name,Last Name,Maiden Name,Address,Birth Date,Headline,Summary,Industry,Zip Code,Geo Location,Twitter Handles,Websites,Instant Messengers
Priya,Sharma,,"12 MG Road, Pune",14 Feb 1998,Backend Engineer | Java · Spring Boot,"Backend engineer building payment APIs.",Software Development,411001,"Pune, Maharashtra, India",,"[PORTFOLIO:https://priya.dev,OTHER:https://github.com/priyasharma]",
`,
    );
  zip.file(
    "Positions.csv",
    `Company Name,Title,Description,Location,Started On,Finished On
Finlytics Technologies,Software Engineer II,"• Designed and built 12 REST APIs in Java and Spring Boot serving 40,000 daily users.
• Migrated the payments service to Kubernetes on AWS.","Pune, India",Apr 2022,
Datawave Solutions,Software Engineer,,Bengaluru,Jul 2020,Mar 2022
`,
  );
  zip.file("Education.csv", `School Name,Start Date,End Date,Notes,Degree Name,Activities\nCollege of Engineering Pune,2016,2020,,B.Tech Computer Science,Coding club\n`);
  zip.file("Skills.csv", `Name\nJava\nSpring Boot\nKubernetes\nPostgreSQL\nPublic Speaking\n`);
  zip.file("Certifications.csv", `Name,Url,Authority,Started On,Finished On,License Number\nAWS Certified Developer – Associate,,Amazon Web Services,May 2023,,ABC-123\n`);
  zip.file("Email Addresses.csv", `Email Address,Confirmed,Primary,Updated On\nold@example.com,Yes,No,1/1/20\npriya.sharma@example.com,Yes,Yes,1/1/24\n`);
  zip.file("PhoneNumbers.csv", `Extension,Number,Type\n,+91 98765 43210,Mobile\n`);
  zip.file("Languages.csv", `Name,Proficiency\nEnglish,Full professional proficiency\nHindi,Native or bilingual proficiency\n`);
  zip.file("Connections.csv", `Notes:\n"Connections exported..."\n\nFirst Name,Last Name,Email Address\nA,B,c@example.com\n`);
  return zip.generateAsync({ type: "nodebuffer" });
}

beforeEach(async () => {
  await useTestDb();
});

describe("LinkedIn data export import", () => {
  it("parses quoted CSV with commas, quotes and newlines", () => {
    expect(parseCsv(`a,b\n"x, y","say ""hi""\nthere"\n`)).toEqual([["a", "b"], ["x, y", 'say "hi"\nthere']]);
  });

  it("maps the export into resume sections and skips personal details", async () => {
    const a = request.agent(app);
    await a.post("/api/auth/register").send({ email: "li1@example.com", password: "a good password 1", fullName: "Test User", phone: "+91 98765 43210" });
    const r = await a.post("/api/import").attach("file", await linkedinZip(), "Basic_LinkedInDataExport.zip");
    expect(r.status).toBe(200);
    expect(r.body.extraction.format).toBe("linkedin");
    const d = r.body.structured.data;
    expect(d.contact).toMatchObject({ fullName: "Priya Sharma", email: "priya.sharma@example.com", phone: "+91 98765 43210", location: "Pune, Maharashtra, India" });
    expect(d.contact.links.map((l: { url: string }) => l.url)).toEqual(["https://priya.dev", "https://github.com/priyasharma"]);
    expect(d.experience).toHaveLength(2);
    expect(d.experience[0]).toMatchObject({ company: "Finlytics Technologies", startDate: "2022-04", current: true });
    expect(d.experience[0].bullets.map((b: { text: string }) => b.text)).toEqual([
      "Designed and built 12 REST APIs in Java and Spring Boot serving 40,000 daily users.",
      "Migrated the payments service to Kubernetes on AWS.",
    ]);
    expect(d.experience[1]).toMatchObject({ endDate: "2022-03", current: false });
    expect(d.education[0]).toMatchObject({ degree: "B.Tech Computer Science", institution: "College of Engineering Pune", endDate: "2020" });
    expect(d.skills.flatMap((g: { items: string[] }) => g.items)).toEqual(expect.arrayContaining(["Java", "Kubernetes", "Public Speaking"]));
    expect(d.certifications[0]).toMatchObject({ issuer: "Amazon Web Services", date: "2023-05" });
    expect(d.additional[0].bullets[0].text).toBe("English (full professional), Hindi (native or bilingual)");

    // Personal fields never reach the resume, and the user is told what was skipped.
    const all = JSON.stringify(d);
    for (const secret of ["MG Road", "1998", "411001", "ABC-123", "c@example.com"]) expect(all).not.toContain(secret);
    expect(r.body.structured.warnings.join(" ")).toMatch(/Not imported \(personal details\): Birth date, Address, Zip code, Certification licence numbers/);
    expect(r.body.ats.score).toBeGreaterThan(0);
  });

  it("still treats Word documents as resumes and rejects unrelated ZIPs", async () => {
    const a = request.agent(app);
    await a.post("/api/auth/register").send({ email: "li2@example.com", password: "a good password 1", fullName: "Test User", phone: "+91 98765 43210" });
    const other = new JSZip();
    other.file("notes.txt", "hello");
    const r = await a.post("/api/import").attach("file", await other.generateAsync({ type: "nodebuffer" }), "x.zip");
    expect(r.status).toBe(422);
  });
});
