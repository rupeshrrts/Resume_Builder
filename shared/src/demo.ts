import { ResumeData } from "./schema/resume";

/** Fictional sample content for the public landing-page demos. */

const b = (id: string, text: string) => ({ id, text, origin: "user" as const });

export const DEMO_RESUME: ResumeData = ResumeData.parse({
  contact: {
    fullName: "Ananya Rao",
    headline: "Full-Stack Developer",
    email: "ananya.rao@example.com",
    phone: "+91 90000 00000",
    location: "Bengaluru, India",
    links: [
      { id: "l1", label: "LinkedIn", url: "linkedin.com/in/ananya-rao-example" },
      { id: "l2", label: "GitHub", url: "github.com/ananya-example" },
    ],
  },
  summary: {
    text: "Full-stack developer with 4 years of experience building React and Node.js applications backed by PostgreSQL. Led the rebuild of a customer portal that cut page load time from 6 seconds to under 2.",
    origin: "user",
  },
  experience: [
    {
      id: "x1",
      title: "Software Engineer",
      company: "Northwind Retail Tech",
      location: "Bengaluru",
      startDate: "2022-06",
      current: true,
      bullets: [
        b("x1a", "Rebuilt the customer portal in React and TypeScript, reducing average page load from 6s to 1.8s."),
        b("x1b", "Designed REST APIs in Node.js and PostgreSQL for order tracking used by 25,000 customers a month."),
        b("x1c", "Introduced Jest and Playwright tests in CI, raising coverage of the checkout flow from 30% to 75%."),
      ],
    },
    {
      id: "x2",
      title: "Associate Developer",
      company: "Bluebird Systems",
      location: "Pune",
      startDate: "2020-07",
      endDate: "2022-05",
      bullets: [b("x2a", "Built internal dashboards with Vue.js and Express used by 3 operations teams."), b("x2b", "Automated weekly sales reports with Python, saving about 5 hours of manual work a week.")],
    },
  ],
  projects: [
    {
      id: "p1",
      name: "Open-source accessibility linter",
      url: "github.com/ananya-example/a11y-lint",
      technologies: ["TypeScript", "Node.js"],
      bullets: [b("p1a", "Wrote a CLI that flags WCAG contrast issues in CSS; 120 stars and 9 contributors on GitHub.")],
    },
  ],
  skills: [
    { id: "s1", category: "Languages", items: ["TypeScript", "JavaScript", "Python", "SQL"] },
    { id: "s2", category: "Frameworks", items: ["React", "Next.js", "Node.js", "Express.js", "Vue.js"] },
    { id: "s3", category: "Data & Cloud", items: ["PostgreSQL", "Redis", "AWS", "Docker"] },
    { id: "s4", category: "Testing", items: ["Jest", "Playwright"] },
  ],
  education: [{ id: "e1", degree: "B.Tech", field: "Computer Science", institution: "National Institute of Technology, Karnataka", startDate: "2016", endDate: "2020", grade: "CGPA: 8.6/10" }],
  certifications: [{ id: "c1", name: "AWS Certified Cloud Practitioner", issuer: "Amazon Web Services", date: "2023-03" }],
});

export const DEMO_JOBS: { id: string; label: string; text: string }[] = [
  {
    id: "fullstack",
    label: "Full-stack developer",
    text: `Full-Stack Developer

Responsibilities:
- Build features end to end with React and Node.js
- Design REST APIs and PostgreSQL schemas
- Write unit and end-to-end tests

Requirements:
- 3+ years of experience with TypeScript and React
- Strong experience with Node.js and PostgreSQL
- Experience with Docker and AWS
- Bachelor's degree in Computer Science or equivalent

Nice to have:
- GraphQL
- Kubernetes`,
  },
  {
    id: "dotnet",
    label: ".NET developer",
    text: `.NET Developer

Responsibilities:
- Build and maintain REST APIs using C# and ASP.NET Core
- Deploy services to Azure

Requirements:
- 4+ years of experience with C# and .NET
- Strong experience with SQL Server and Entity Framework
- Experience with microservices and Docker

Nice to have:
- Angular`,
  },
  {
    id: "analyst",
    label: "Data analyst",
    text: `Data Analyst

Responsibilities:
- Build dashboards in Power BI or Tableau
- Analyse sales data with SQL and Python

Requirements:
- 2+ years of experience in data analysis
- Strong SQL and Excel skills
- Experience with Python and Pandas

Preferred:
- Statistics or A/B testing experience`,
  },
];

export const BULLET_EXAMPLES = [
  { label: "Weak", text: "Responsible for working on the website and helping the team with various tasks etc." },
  { label: "Better", text: "Developed new pages for the company website using React." },
  { label: "Strong", text: "Rebuilt the checkout page in React, cutting load time from 4s to 1.5s and lifting completed orders by 12%." },
];
