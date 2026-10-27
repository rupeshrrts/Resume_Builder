import { ResumeData, defaultSettings, type ResumeSettings } from "@resume/shared/schema/resume";

let n = 0;
const id = (p: string) => `${p}_${++n}`;
const b = (text: string) => ({ id: id("b"), text, origin: "user" as const });

export function sampleResume(): ResumeData {
  return ResumeData.parse({
    contact: {
      fullName: "Priya Sharma",
      headline: "Backend Engineer",
      email: "priya.sharma@example.com",
      phone: "+91 98765 43210",
      location: "Pune, Maharashtra",
      links: [
        { id: id("l"), label: "LinkedIn", url: "linkedin.com/in/priya-sharma-dev" },
        { id: id("l"), label: "GitHub", url: "https://github.com/priyasharma" },
      ],
    },
    summary: {
      text: "Backend engineer with 4 years of experience building REST APIs and data pipelines in Java and Python. Led the migration of a payments service to Kubernetes and mentored three junior developers.",
      origin: "user",
    },
    experience: [
      {
        id: id("exp"),
        title: "Software Engineer II",
        company: "Finlytics Technologies Pvt Ltd",
        location: "Pune",
        startDate: "2022-04",
        current: true,
        bullets: [
          b("Designed and built 12 REST APIs in Java and Spring Boot serving 40,000 daily users."),
          b("Migrated the payments service from VMs to Kubernetes on AWS, cutting deployment time from 2 hours to 15 minutes."),
          b("Mentored three junior developers through code reviews and pairing sessions."),
        ],
      },
      {
        id: id("exp"),
        title: "Software Engineer",
        company: "Datawave Solutions",
        location: "Bengaluru",
        startDate: "2020-07",
        endDate: "2022-03",
        bullets: [
          b("Built ETL pipelines in Python and Airflow loading 2 TB of sales data into PostgreSQL each month."),
          b("Responsible for writing unit tests with pytest for the reporting module."),
        ],
      },
    ],
    education: [
      {
        id: id("edu"),
        degree: "B.Tech",
        field: "Computer Science",
        institution: "College of Engineering Pune",
        location: "Pune",
        startDate: "2016",
        endDate: "2020",
        grade: "CGPA: 8.4/10",
      },
    ],
    projects: [
      {
        id: id("prj"),
        name: "Expense Splitter",
        url: "github.com/priyasharma/splitter",
        technologies: ["Python", "FastAPI", "Redis"],
        bullets: [b("Built a bill-splitting API with FastAPI and Redis caching, used by 300 classmates.")],
      },
    ],
    skills: [
      { id: id("sk"), category: "Languages", items: ["Java", "Python", "SQL"] },
      { id: id("sk"), category: "Frameworks", items: ["Spring Boot", "FastAPI"] },
      { id: id("sk"), category: "Cloud & DevOps", items: ["AWS", "Docker", "Kubernetes", "Jenkins"] },
      { id: id("sk"), category: "Databases", items: ["PostgreSQL", "Redis", "MongoDB"] },
    ],
    certifications: [{ id: id("cert"), name: "AWS Certified Developer – Associate", issuer: "Amazon Web Services", date: "2023-05" }],
    additional: [{ id: id("add"), title: "Languages", bullets: [b("English, Hindi, Marathi")] }],
  });
}

export function sampleSettings(overrides: Partial<ResumeSettings> = {}): ResumeSettings {
  return defaultSettings({ template: "classic", ...overrides });
}

export const SAMPLE_JD = `Senior Backend Developer (Java)
About the role
You will design and build scalable payment services for our lending platform.

Responsibilities:
- Design and build REST APIs and microservices in Java and Spring Boot
- Deploy services on Kubernetes and AWS
- Write unit tests and take part in code reviews

Requirements:
- 5+ years of experience in backend development
- Strong experience with Java, Spring Boot and PostgreSQL
- Experience with Kafka or other message queues
- Bachelor's degree in Computer Science or related field

Nice to have:
- Experience with Terraform
- Familiarity with Go

Benefits:
- Health insurance and flexible hours
`;
