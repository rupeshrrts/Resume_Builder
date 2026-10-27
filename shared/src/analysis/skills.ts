import { escapeRegex } from "./text";

/**
 * Curated skills taxonomy used to recognise skills in resumes and job descriptions.
 * Matching is deterministic (regex with word boundaries and aliases), so results are
 * reproducible and explainable. Anything outside the taxonomy is handled as a plain keyword.
 */

export type SkillCategory =
  | "Languages"
  | "Frontend"
  | "Backend & Frameworks"
  | "Databases"
  | "Cloud & DevOps"
  | "Data & AI"
  | "Security"
  | "Testing & Quality"
  | "Tools & Platforms"
  | "Engineering & Manufacturing"
  | "Business & Finance"
  | "Methods & Practices"
  | "Education";

export interface SkillDef {
  name: string;
  category: SkillCategory;
  aliases: string[];
  /** Match case-sensitively (for words that are also common English: Go, Swift, React, Excel, Spring...). */
  cs?: boolean;
  /** Skills in the same family count as related/transferable (e.g. AWS ↔ Azure). */
  family?: string;
  /** Older technology; flagged for review, not removed. */
  legacy?: string;
  /** Longer names of different skills that contain this one (e.g. Azure inside Azure DevOps). */
  excludeWithin?: string[];
}

const S = (
  name: string,
  category: SkillCategory,
  aliases: string[] = [],
  opts: Partial<Pick<SkillDef, "cs" | "family" | "legacy" | "excludeWithin">> = {},
): SkillDef => ({ name, category, aliases, ...opts });

export const SKILLS: SkillDef[] = [
  // Languages
  S("JavaScript", "Languages", ["JS", "ECMAScript", "ES6"], { family: "web-lang" }),
  S("TypeScript", "Languages", ["TS"], { family: "web-lang", cs: true }),
  S("Python", "Languages", [], { family: "script-lang" }),
  S("Java", "Languages", ["Core Java", "J2EE", "Java EE"], { family: "jvm" }),
  S("Kotlin", "Languages", [], { family: "jvm" }),
  S("Scala", "Languages", [], { family: "jvm" }),
  S("C#", "Languages", ["C Sharp", "CSharp"], { family: "dotnet" }),
  S("C++", "Languages", ["CPP"], { family: "systems-lang" }),
  S("C", "Languages", ["Embedded C"], { cs: true, family: "systems-lang" }),
  S("Go", "Languages", ["Golang"], { cs: true, family: "systems-lang" }),
  S("Rust", "Languages", [], { cs: true, family: "systems-lang" }),
  S("Ruby", "Languages", [], { cs: true, family: "script-lang" }),
  S("PHP", "Languages", [], { family: "script-lang" }),
  S("Swift", "Languages", [], { cs: true, family: "mobile-lang" }),
  S("Objective-C", "Languages", [], { family: "mobile-lang", legacy: "Largely replaced by Swift for new iOS work." }),
  S("Dart", "Languages", [], { cs: true, family: "mobile-lang" }),
  S("R", "Languages", ["R programming"], { cs: true, family: "data-lang" }),
  S("MATLAB", "Languages", ["Simulink"], { family: "data-lang" }),
  S("SQL", "Languages", ["T-SQL", "PL/SQL", "TSQL"], { family: "sql" }),
  S("Bash", "Languages", ["Shell scripting", "Unix shell"], { family: "script-lang" }),
  S("PowerShell", "Languages", [], { family: "script-lang" }),
  S("Perl", "Languages", [], { cs: true, family: "script-lang" }),
  S("VB.NET", "Languages", ["Visual Basic .NET"], { family: "dotnet" }),
  S("VBA", "Languages", ["Excel VBA", "Macros"], { family: "office" }),
  S("COBOL", "Languages", [], { legacy: "Mainframe-era; keep only if the role involves legacy systems." }),
  S("Solidity", "Languages", []),
  S("HTML", "Frontend", ["HTML5"], { family: "web-markup" }),
  S("CSS", "Frontend", ["CSS3"], { family: "web-markup" }),

  // Frontend
  S("React", "Frontend", ["React.js", "ReactJS", "React JS"], { cs: true, family: "spa", excludeWithin: ["React Native"] }),
  S("Next.js", "Frontend", ["NextJS", "Next JS"], { family: "spa" }),
  S("Angular", "Frontend", ["Angular 2+"], { family: "spa" }),
  S("AngularJS", "Frontend", ["Angular.js", "Angular 1"], { family: "spa", legacy: "AngularJS reached end of life in 2021." }),
  S("Vue.js", "Frontend", ["Vue", "VueJS", "Nuxt", "Nuxt.js"], { cs: true, family: "spa" }),
  S("Svelte", "Frontend", ["SvelteKit"], { family: "spa" }),
  S("Redux", "Frontend", ["Redux Toolkit"], { family: "state" }),
  S("Tailwind CSS", "Frontend", ["Tailwind", "TailwindCSS"], { family: "css-fw" }),
  S("Bootstrap", "Frontend", [], { family: "css-fw" }),
  S("Sass", "Frontend", ["SCSS"], { family: "css-fw" }),
  S("jQuery", "Frontend", [], { legacy: "Rarely used for new projects; list modern frameworks first." }),
  S("Webpack", "Frontend", ["Vite"], { family: "bundler" }),
  S("React Native", "Frontend", [], { family: "mobile-fw" }),
  S("Flutter", "Frontend", [], { family: "mobile-fw" }),
  S("Android", "Frontend", ["Android SDK", "Jetpack Compose"], { family: "mobile-fw" }),
  S("iOS", "Frontend", ["SwiftUI", "UIKit"], { cs: true, family: "mobile-fw" }),
  S("Accessibility", "Frontend", ["WCAG", "a11y", "ARIA"]),
  S("Figma", "Tools & Platforms", [], { family: "design" }),

  // Backend
  S("Node.js", "Backend & Frameworks", ["NodeJS", "Node JS", "Node"], { cs: true, family: "js-backend" }),
  S("Express.js", "Backend & Frameworks", ["ExpressJS"], { cs: true, family: "js-backend" }),
  S("NestJS", "Backend & Frameworks", ["Nest.js"], { family: "js-backend" }),
  S(".NET", "Backend & Frameworks", ["dotnet", ".NET Core", ".NET Framework", "ASP.NET", "ASP.NET Core", ".NET 6", ".NET 8"], { family: "dotnet" }),
  S("Entity Framework", "Backend & Frameworks", ["EF Core", "Entity Framework Core"], { family: "orm" }),
  S("Spring Boot", "Backend & Frameworks", ["Spring Framework", "Spring MVC"], { cs: true, family: "jvm" }),
  S("Hibernate", "Backend & Frameworks", ["JPA"], { family: "orm" }),
  S("Django", "Backend & Frameworks", ["Django REST Framework", "DRF"], { family: "py-backend" }),
  S("Flask", "Backend & Frameworks", [], { cs: true, family: "py-backend" }),
  S("FastAPI", "Backend & Frameworks", [], { family: "py-backend" }),
  S("Ruby on Rails", "Backend & Frameworks", ["Rails"], { cs: true, family: "rb-backend" }),
  S("Laravel", "Backend & Frameworks", [], { family: "php-backend" }),
  S("REST APIs", "Backend & Frameworks", ["REST", "RESTful", "RESTful APIs", "REST API", "Web APIs", "Web API"], { family: "api" }),
  S("GraphQL", "Backend & Frameworks", ["Apollo GraphQL"], { family: "api" }),
  S("gRPC", "Backend & Frameworks", ["Protocol Buffers", "protobuf"], { family: "api" }),
  S("Microservices", "Backend & Frameworks", ["Microservice architecture", "micro-services"], { family: "architecture" }),
  S("Distributed Systems", "Backend & Frameworks", ["distributed computing"], { family: "architecture" }),
  S("System Design", "Backend & Frameworks", ["Software architecture", "Solution architecture"], { family: "architecture" }),
  S("Event-Driven Architecture", "Backend & Frameworks", ["event driven", "event-driven", "CQRS", "event sourcing"], { family: "architecture" }),
  S("Kafka", "Backend & Frameworks", ["Apache Kafka"], { family: "messaging" }),
  S("RabbitMQ", "Backend & Frameworks", ["AMQP"], { family: "messaging" }),
  S("Message Queues", "Backend & Frameworks", ["SQS", "Azure Service Bus", "Pub/Sub"], { family: "messaging" }),
  S("WebSockets", "Backend & Frameworks", ["WebSocket", "Socket.IO", "SignalR"]),
  S("OAuth", "Security", ["OAuth 2.0", "OAuth2", "OpenID Connect", "OIDC", "JWT", "SSO", "SAML"], { family: "auth" }),

  // Databases
  S("PostgreSQL", "Databases", ["Postgres", "Postgre SQL", "psql"], { family: "rdbms" }),
  S("MySQL", "Databases", ["MariaDB"], { family: "rdbms" }),
  S("SQL Server", "Databases", ["MS SQL", "MSSQL", "Microsoft SQL Server"], { family: "rdbms" }),
  S("Oracle Database", "Databases", ["Oracle DB", "Oracle"], { cs: true, family: "rdbms" }),
  S("SQLite", "Databases", [], { family: "rdbms" }),
  S("MongoDB", "Databases", ["Mongo"], { family: "nosql" }),
  S("Redis", "Databases", [], { family: "cache" }),
  S("Cassandra", "Databases", ["Apache Cassandra"], { family: "nosql" }),
  S("DynamoDB", "Databases", ["Amazon DynamoDB"], { family: "nosql" }),
  S("Elasticsearch", "Databases", ["Elastic", "OpenSearch", "ELK"], { cs: true, family: "search" }),
  S("Database Design", "Databases", ["data modeling", "data modelling", "schema design", "normalization"]),
  S("Query Optimization", "Databases", ["query tuning", "performance tuning", "indexing strategy", "query performance"]),
  S("Stored Procedures", "Databases", ["stored procedure", "triggers"]),
  S("Snowflake", "Databases", [], { family: "warehouse" }),
  S("BigQuery", "Databases", ["Google BigQuery"], { family: "warehouse" }),
  S("Redshift", "Databases", ["Amazon Redshift"], { family: "warehouse" }),

  // Cloud & DevOps
  S("AWS", "Cloud & DevOps", ["Amazon Web Services", "EC2", "S3", "Lambda", "ECS", "EKS", "CloudFormation"], { family: "cloud" }),
  S("Azure", "Cloud & DevOps", ["Microsoft Azure", "Azure Functions", "Azure App Service", "AKS"], { family: "cloud", excludeWithin: ["Azure DevOps", "Azure Pipelines", "Azure Repos"] }),
  S("Azure DevOps", "Cloud & DevOps", ["Azure Pipelines", "Azure Repos", "TFS", "Team Foundation Server"], { family: "cicd" }),
  S("Google Cloud", "Cloud & DevOps", ["GCP", "Google Cloud Platform"], { family: "cloud" }),
  S("Docker", "Cloud & DevOps", ["containers", "containerization", "Dockerfile"], { family: "containers" }),
  S("Kubernetes", "Cloud & DevOps", ["K8s", "Helm", "OpenShift"], { family: "containers" }),
  S("Terraform", "Cloud & DevOps", ["Infrastructure as Code", "IaC", "Pulumi"], { family: "iac" }),
  S("Ansible", "Cloud & DevOps", ["Puppet"], { family: "iac" }),
  S("CI/CD", "Cloud & DevOps", ["continuous integration", "continuous delivery", "continuous deployment", "CI CD"], { family: "cicd" }),
  S("Jenkins", "Cloud & DevOps", [], { family: "cicd" }),
  S("GitHub Actions", "Cloud & DevOps", [], { family: "cicd" }),
  S("GitLab CI", "Cloud & DevOps", ["GitLab CI/CD"], { family: "cicd" }),
  S("Linux", "Cloud & DevOps", ["Unix", "Ubuntu", "RHEL", "CentOS"], { family: "os" }),
  S("Windows Server", "Cloud & DevOps", ["IIS", "Active Directory"], { family: "os" }),
  S("Nginx", "Cloud & DevOps", ["Apache HTTP Server"], { family: "webserver" }),
  S("Observability", "Cloud & DevOps", ["Prometheus", "Grafana", "Datadog", "New Relic", "CloudWatch", "application monitoring"]),
  S("Serverless", "Cloud & DevOps", ["serverless architecture"], { family: "cloud" }),
  S("Networking", "Cloud & DevOps", ["TCP/IP", "DNS", "load balancing", "VPC", "CCNA"]),

  // Data & AI
  S("Machine Learning", "Data & AI", ["ML", "scikit-learn", "sklearn"], { family: "ml" }),
  S("Deep Learning", "Data & AI", ["neural networks", "CNN", "RNN"], { family: "ml" }),
  S("TensorFlow", "Data & AI", ["Keras"], { family: "ml-fw" }),
  S("PyTorch", "Data & AI", [], { family: "ml-fw" }),
  S("NLP", "Data & AI", ["natural language processing", "spaCy", "NLTK"], { family: "ml" }),
  S("Computer Vision", "Data & AI", ["OpenCV", "image processing"], { family: "ml" }),
  S("LLMs", "Data & AI", ["large language models", "LLM", "generative AI", "GenAI", "RAG", "prompt engineering", "LangChain"], { family: "ml" }),
  S("Pandas", "Data & AI", ["NumPy"], { family: "py-data" }),
  S("Apache Spark", "Data & AI", ["Spark", "PySpark"], { cs: true, family: "big-data" }),
  S("Hadoop", "Data & AI", ["HDFS", "Hive", "MapReduce"], { family: "big-data", legacy: "Many teams have moved to Spark and cloud warehouses." }),
  S("Airflow", "Data & AI", ["Apache Airflow"], { family: "pipeline" }),
  S("ETL", "Data & AI", ["ELT", "data pipelines", "data pipeline", "data integration", "SSIS"], { family: "pipeline" }),
  S("dbt", "Data & AI", [], { cs: true, family: "pipeline" }),
  S("Data Analysis", "Data & AI", ["data analytics", "analytics", "exploratory data analysis", "EDA"], { family: "analysis" }),
  S("Statistics", "Data & AI", ["statistical analysis", "hypothesis testing", "A/B testing", "regression"], { family: "analysis" }),
  S("Data Visualization", "Data & AI", ["dashboards", "dashboarding", "data visualisation"], { family: "bi" }),
  S("Power BI", "Data & AI", ["PowerBI", "DAX", "Power Query"], { family: "bi" }),
  S("Tableau", "Data & AI", [], { family: "bi" }),
  S("Looker", "Data & AI", ["Looker Studio", "Google Data Studio"], { family: "bi" }),
  S("Excel", "Business & Finance", ["Microsoft Excel", "MS Excel", "Advanced Excel", "pivot tables", "VLOOKUP", "XLOOKUP"], { cs: true, family: "office" }),
  S("Jupyter", "Data & AI", ["Jupyter Notebook"], { family: "py-data" }),
  S("MLOps", "Data & AI", ["MLflow", "Kubeflow", "SageMaker"], { family: "ml" }),

  // Security
  S("Cybersecurity", "Security", ["information security", "InfoSec", "cyber security", "IT security"], { family: "security" }),
  S("Penetration Testing", "Security", ["pen testing", "pentesting", "ethical hacking", "Burp Suite", "Metasploit"], { family: "offsec" }),
  S("Vulnerability Management", "Security", ["vulnerability assessment", "VAPT", "Nessus", "Qualys"], { family: "security" }),
  S("SIEM", "Security", ["Splunk", "QRadar", "Microsoft Sentinel", "security monitoring"], { family: "soc" }),
  S("Incident Response", "Security", ["DFIR", "digital forensics", "threat hunting"], { family: "soc" }),
  S("OWASP", "Security", ["OWASP Top 10", "secure coding", "application security", "AppSec"], { family: "appsec" }),
  S("Network Security", "Security", ["firewalls", "IDS/IPS", "IDS", "VPN", "Wireshark"], { family: "security" }),
  S("IAM", "Security", ["identity and access management", "Okta", "privileged access", "PAM"], { family: "auth" }),
  S("Cryptography", "Security", ["encryption", "PKI", "TLS", "SSL"], { family: "security" }),
  S("Compliance", "Security", ["ISO 27001", "SOC 2", "GDPR", "PCI DSS", "HIPAA", "NIST", "DPDP"], { family: "grc" }),
  S("Cloud Security", "Security", ["CSPM", "AWS security", "Azure security"], { family: "security" }),

  // Testing
  S("Unit Testing", "Testing & Quality", ["unit tests", "JUnit", "NUnit", "xUnit", "pytest", "Jest", "Mocha", "Vitest", "TDD", "test-driven development"], { family: "testing" }),
  S("Test Automation", "Testing & Quality", ["Selenium", "Cypress", "Playwright", "Appium", "automation testing", "automated testing"], { family: "testing" }),
  S("Manual Testing", "Testing & Quality", ["functional testing", "regression testing", "UAT", "test cases"], { family: "testing" }),
  S("Performance Testing", "Testing & Quality", ["load testing", "JMeter", "k6", "Gatling"], { family: "testing" }),
  S("Code Review", "Testing & Quality", ["code reviews", "peer review"], { family: "practice" }),

  // Tools
  S("Git", "Tools & Platforms", ["GitHub", "GitLab", "Bitbucket", "version control"], { cs: true, family: "vcs" }),
  S("SVN", "Tools & Platforms", ["Subversion"], { family: "vcs", legacy: "Most teams now use Git." }),
  S("Jira", "Tools & Platforms", ["Confluence"], { family: "pm-tools" }),
  S("Postman", "Tools & Platforms", ["Swagger", "OpenAPI"], { family: "api-tools" }),
  S("Visual Studio", "Tools & Platforms", ["VS Code", "Visual Studio Code"], { family: "ide" }),
  S("SAP", "Business & Finance", ["SAP ERP", "SAP S/4HANA", "SAP FICO", "SAP MM", "SAP SD"], { family: "erp" }),
  S("Salesforce", "Business & Finance", ["SFDC", "Apex"], { family: "crm" }),
  S("CRM", "Business & Finance", ["HubSpot", "Zoho CRM", "customer relationship management"], { family: "crm" }),
  S("Tally", "Business & Finance", ["Tally ERP", "Tally Prime", "TallyPrime"], { family: "accounting-sw" }),
  S("QuickBooks", "Business & Finance", [], { family: "accounting-sw" }),
  S("Microsoft Office", "Tools & Platforms", ["MS Office", "MS Word", "Microsoft Word", "PowerPoint", "Office 365", "Microsoft 365"], { cs: true, family: "office" }),
  S("Google Workspace", "Tools & Platforms", ["Google Sheets", "G Suite"], { family: "office" }),

  // Engineering & manufacturing
  S("AutoCAD", "Engineering & Manufacturing", ["AutoCAD Electrical"], { family: "cad" }),
  S("SolidWorks", "Engineering & Manufacturing", ["CATIA", "Creo", "NX", "Fusion 360"], { cs: true, family: "cad" }),
  S("PLC Programming", "Engineering & Manufacturing", ["PLC", "Ladder logic", "Siemens TIA Portal", "Allen-Bradley"], { family: "automation" }),
  S("SCADA", "Engineering & Manufacturing", ["HMI", "DCS"], { family: "automation" }),
  S("Embedded Systems", "Engineering & Manufacturing", ["microcontrollers", "Arduino", "ARM Cortex", "RTOS", "firmware"], { family: "embedded" }),
  S("IoT", "Engineering & Manufacturing", ["Internet of Things", "MQTT", "Raspberry Pi"], { cs: true, family: "embedded" }),
  S("PCB Design", "Engineering & Manufacturing", ["Altium", "KiCad", "Eagle", "OrCAD"], { family: "electronics" }),
  S("Power Systems", "Engineering & Manufacturing", ["switchgear", "transformers", "protection relays", "substation", "power distribution"], { family: "electrical" }),
  S("Electrical Testing", "Engineering & Manufacturing", ["testing and commissioning", "commissioning", "insulation resistance", "relay testing"], { family: "electrical" }),
  S("Quality Control", "Engineering & Manufacturing", ["QC", "quality assurance", "QA", "inspection", "ISO 9001"], { cs: true, family: "quality" }),
  S("Six Sigma", "Methods & Practices", ["Lean Six Sigma", "DMAIC", "Green Belt", "Black Belt"], { family: "process" }),
  S("Lean Manufacturing", "Engineering & Manufacturing", ["Lean", "Kaizen", "5S", "TPM", "Kanban"], { cs: true, family: "process" }),
  S("Supply Chain", "Business & Finance", ["supply chain management", "SCM", "logistics", "inventory management"], { family: "ops" }),
  S("Procurement", "Business & Finance", ["purchasing", "vendor management", "sourcing"], { family: "ops" }),

  // Business & finance
  S("Accounting", "Business & Finance", ["bookkeeping", "general ledger", "accounts payable", "accounts receivable", "reconciliation"], { family: "finance" }),
  S("GST", "Business & Finance", ["GST filing", "GST compliance", "TDS", "income tax"], { family: "tax" }),
  S("Financial Modeling", "Business & Finance", ["financial modelling", "valuation", "DCF", "forecasting", "budgeting"], { family: "finance" }),
  S("Financial Reporting", "Business & Finance", ["MIS reporting", "IFRS", "Ind AS", "GAAP", "audit"], { family: "finance" }),
  S("Sales", "Business & Finance", ["B2B sales", "inside sales", "business development", "lead generation", "account management"], { family: "sales" }),
  S("Digital Marketing", "Business & Finance", ["SEO", "SEM", "Google Ads", "social media marketing", "content marketing", "email marketing", "Google Analytics"], { family: "marketing" }),
  S("Recruitment", "Business & Finance", ["talent acquisition", "hiring", "sourcing candidates", "onboarding"], { family: "hr" }),
  S("HR Operations", "Business & Finance", ["payroll", "HRMS", "employee relations", "performance management"], { family: "hr" }),
  S("Customer Service", "Business & Finance", ["customer support", "client servicing", "customer success"], { family: "service" }),
  S("Project Management", "Methods & Practices", ["PMP", "project planning", "program management", "PRINCE2", "MS Project"], { family: "pm" }),
  S("Product Management", "Methods & Practices", ["product roadmap", "roadmapping", "product strategy", "PRD"], { family: "pm" }),
  S("Stakeholder Management", "Methods & Practices", ["stakeholder communication", "client management"], { family: "leadership" }),
  S("People Management", "Methods & Practices", ["team leadership", "team management", "mentoring", "coaching", "line management"], { family: "leadership" }),
  S("Business Analysis", "Methods & Practices", ["requirements gathering", "BRD", "process mapping", "BPMN"], { family: "analysis" }),

  // Methods & practices
  S("Agile", "Methods & Practices", ["Scrum", "Kanban boards", "sprint planning", "SAFe"], { family: "agile" }),
  S("DevOps", "Methods & Practices", ["SRE", "site reliability engineering"], { family: "cicd" }),
  S("Object-Oriented Programming", "Methods & Practices", ["OOP", "OOPS", "object oriented", "SOLID", "design patterns"], { family: "practice" }),
  S("Data Structures & Algorithms", "Methods & Practices", ["DSA", "data structures", "algorithms"], { family: "practice" }),

  // Education (teaching roles)
  S("Lesson Planning", "Education", ["lesson plans", "curriculum planning"], { family: "teaching" }),
  S("Curriculum Development", "Education", ["curriculum design", "instructional design"], { family: "teaching" }),
  S("Classroom Management", "Education", [], { family: "teaching" }),
  S("CBSE", "Education", ["ICSE", "NCERT", "state board"], { family: "teaching" }),
];

const byName = new Map(SKILLS.map((s) => [s.name.toLowerCase(), s]));

export function findSkill(name: string): SkillDef | undefined {
  const k = name.trim().toLowerCase();
  if (byName.has(k)) return byName.get(k);
  for (const s of SKILLS) if (s.aliases.some((a) => a.toLowerCase() === k)) return s;
  return undefined;
}

function termPattern(term: string): string {
  // Boundaries that respect symbols in names such as C++, C#, .NET, Node.js and CI/CD.
  return `(?<![A-Za-z0-9+#])${escapeRegex(term)}(?![A-Za-z0-9+#]|\\.[A-Za-z0-9])`;
}

interface CompiledSkill {
  def: SkillDef;
  terms: { term: string; re: RegExp }[];
}

const compiled: CompiledSkill[] = SKILLS.map((def) => ({
  def,
  terms: [def.name, ...def.aliases]
    // Longer terms first so "ASP.NET Core" is reported rather than ".NET".
    .sort((a, b) => b.length - a.length)
    .map((term) => ({ term, re: new RegExp(termPattern(term), def.cs || term.length <= 2 ? "g" : "gi") })),
}));

// Single-letter language names are ambiguous ("Grade C", "R&D"), so require a programming context.
function plausible(def: SkillDef, matched: string, text: string, index: number) {
  for (const longer of def.excludeWithin ?? []) {
    const start = Math.max(0, index - longer.length);
    const window = text.slice(start, index + longer.length).toLowerCase();
    const at = window.indexOf(longer.toLowerCase());
    if (at >= 0 && start + at <= index && start + at + longer.length >= index + matched.length) return false;
  }
  const ctx = text.slice(Math.max(0, index - 15), index + matched.length + 15);
  const next = text.slice(index + matched.length, index + matched.length + 1);
  if (def.name === "C" && matched === "C") {
    if (/[-'’&]/.test(next)) return false;
    return /C\/C\+\+|\bC\s*,|,\s*C\b|\bC and\b|\band C\b|\bin C\b|\bC programming|\bC language/.test(ctx);
  }
  if (def.name === "R" && matched === "R") {
    if (/[-'’&]/.test(next)) return false;
    return /\bR\s*,|,\s*R\b|\bR and\b|\band R\b|\bin R\b|\bR programming|\bR language|\bR\/|RStudio/.test(ctx);
  }
  if (def.name === "Go" && matched === "Go") {
    const after = text.slice(index + 2, index + 4);
    return !/^[-’']/.test(after) && !/\bGo (to|live|ahead)\b/i.test(text.slice(index, index + 9));
  }
  return true;
}

export interface SkillHit {
  skill: SkillDef;
  /** The exact wording found in the text. */
  matched: string;
  index: number;
}

/** Finds taxonomy skills mentioned in a text. One hit per skill (first occurrence). */
export function findSkills(text: string): SkillHit[] {
  const hits: SkillHit[] = [];
  for (const c of compiled) {
    for (const { re } of c.terms) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      let found: SkillHit | null = null;
      while ((m = re.exec(text))) {
        if (plausible(c.def, m[0], text, m.index)) {
          found = { skill: c.def, matched: m[0], index: m.index };
          break;
        }
      }
      if (found) {
        hits.push(found);
        break;
      }
    }
  }
  return hits.sort((a, b) => a.index - b.index);
}

export function countSkillMentions(text: string, def: SkillDef): number {
  const c = compiled.find((x) => x.def === def);
  if (!c) return 0;
  let n = 0;
  for (const { re } of c.terms) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) if (plausible(def, m[0], text, m.index)) n++;
  }
  return n;
}

export function textHasSkill(text: string, def: SkillDef): string | null {
  const c = compiled.find((x) => x.def === def);
  if (!c) return null;
  for (const { re } of c.terms) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) if (plausible(def, m[0], text, m.index)) return m[0];
  }
  return null;
}

/** Labels that overstate proficiency or can't be verified by a recruiter. */
export const SKILL_LEVEL_LABEL = /\b(expert|guru|ninja|rockstar|master(y)?|advanced|proficient|intermediate|beginner|basic)\b|\(\s*\d+\s*\/\s*\d+\s*\)|\d+\s*\/\s*10|\d{2,3}\s*%/i;
