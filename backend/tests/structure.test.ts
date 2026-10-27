import { describe, expect, it } from "vitest";
import { structureResume } from "@/parse/structure";

const FRESHER = `RAHUL VERMA
Aspiring Data Analyst
rahul.verma@gmail.com | 9876543210 | Indore, Madhya Pradesh | linkedin.com/in/rahul-verma

CAREER OBJECTIVE
To obtain a challenging position as a data analyst where I can use my skills in SQL, Python and Power BI to help the organisation grow.

EDUCATION
Bachelor of Computer Applications (BCA)
Devi Ahilya Vishwavidyalaya, Indore    2021 - 2024
CGPA: 8.1/10
Class XII (CBSE)
Delhi Public School, Indore    2021
Percentage: 86%

INTERNSHIP
Data Analyst Intern | Pixel Analytics Pvt Ltd    Jun 2023 - Aug 2023
• Cleaned and analysed sales data of 50,000 rows using Python and Pandas, and built a Power BI
dashboard used by the sales team.
• Wrote SQL queries to automate the weekly report.

ACADEMIC PROJECTS
Movie Recommendation System
• Built a content-based recommender in Python using scikit-learn.
Tech Stack: Python, Pandas, scikit-learn

TECHNICAL SKILLS
Languages: Python, SQL
Tools: Power BI, Excel, Jupyter

CERTIFICATIONS
Google Data Analytics Professional Certificate - Coursera (2023)

PERSONAL DETAILS
Date of Birth: 12/05/2003
Father's Name: Suresh Verma
Marital Status: Single

DECLARATION
I hereby declare that the above information is true.`;

describe("heuristic structuring of a typical Indian fresher resume", () => {
  const r = structureResume(FRESHER.split("\n"));
  it("reads contact details", () => {
    expect(r.data.contact.fullName).toBe("Rahul Verma");
    expect(r.data.contact.email).toBe("rahul.verma@gmail.com");
    expect(r.data.contact.phone.replace(/\D/g, "")).toContain("9876543210");
    expect(r.data.contact.location).toBe("Indore, Madhya Pradesh");
    expect(r.data.contact.links[0].url).toContain("linkedin.com/in/rahul-verma");
  });
  it("maps objective to summary and internships to experience", () => {
    expect(r.data.summary.text).toMatch(/^To obtain a challenging position/);
    expect(r.data.experience).toHaveLength(1);
    expect(r.data.experience[0]).toMatchObject({ title: "Data Analyst Intern", company: "Pixel Analytics Pvt Ltd", employmentType: "Internship", startDate: "2023-06", endDate: "2023-08" });
  });
  it("joins wrapped bullet lines", () => {
    expect(r.data.experience[0].bullets).toHaveLength(2);
    expect(r.data.experience[0].bullets[0].text).toMatch(/Power BI dashboard used by the sales team\.$/);
  });
  it("parses education entries with grades", () => {
    expect(r.data.education.length).toBe(2);
    expect(r.data.education[0].institution).toMatch(/Devi Ahilya/);
    expect(r.data.education[0].grade).toMatch(/8\.1/);
    expect(r.data.education[0].endDate).toBe("2024");
  });
  it("parses projects, skills and certifications", () => {
    expect(r.data.projects[0].name).toBe("Movie Recommendation System");
    expect(r.data.projects[0].technologies).toEqual(["Python", "Pandas", "scikit-learn"]);
    expect(r.data.skills.find((g) => g.category === "Languages")?.items).toEqual(["Python", "SQL"]);
    expect(r.data.certifications[0].name).toMatch(/Google Data Analytics/);
  });
  it("does not import personal details or declarations", () => {
    const all = JSON.stringify(r.data);
    expect(all).not.toMatch(/Date of Birth|Suresh|Marital|hereby declare/);
    expect(r.skipped.map((s) => s.title)).toEqual(expect.arrayContaining(["Personal Details", "Declaration"]));
  });
  it("marks everything as imported", () => {
    expect(r.data.summary.origin).toBe("imported");
    expect(r.data.experience[0].bullets.every((b) => b.origin === "imported")).toBe(true);
  });
});

describe("structuring edge cases", () => {
  it("warns when no headings are found instead of guessing", () => {
    const r = structureResume(["Jane Doe", "jane@x.com", "I have done many things in many places over many years."]);
    expect(r.warnings.join(" ")).toMatch(/No standard section headings/);
  });
  it("keeps the phone number exactly as written", () => {
    const r = structureResume(["Asha Kulkarni", "asha@example.test | +91 98200 12345 | Pune, Maharashtra"]);
    expect(r.data.contact.phone).toBe("+91 98200 12345");
  });
  it("handles empty input", () => {
    const r = structureResume([]);
    expect(r.data.experience).toEqual([]);
  });
});
