/**
 * Helpful guides for common resume searches. Each one answers its question fully and links to the
 * builder; search engines rank pages that genuinely help, not keyword lists.
 */

export interface Guide {
  slug: string;
  /** The <title> and the main search phrase. */
  title: string;
  description: string;
  h1: string;
  intro: string;
  updated: string;
  sections: { heading: string; paragraphs?: string[]; bullets?: string[] }[];
  faq: { q: string; a: string }[];
}

export const GUIDES: Guide[] = [
  {
    slug: "ats-resume-format",
    title: "ATS-Friendly Resume Format: What Works and What Breaks",
    description:
      "The resume format applicant tracking systems read correctly: layout, headings, fonts, dates and file type, with a checklist you can use before applying.",
    h1: "ATS-friendly resume format: what works and what breaks",
    intro:
      "An applicant tracking system (ATS) turns your resume into plain text before anyone reads it. If the layout confuses that step, your experience can end up in the wrong place or disappear. The good news: an ATS-friendly format is also the clearest format for a human recruiter.",
    updated: "2026-10-27",
    sections: [
      {
        heading: "Use one column",
        paragraphs: [
          "Two-column designs look modern, but many parsers read them left to right across both columns, mixing your skills into your job history. A single column keeps the reading order the same for software and people.",
        ],
      },
      {
        heading: "Stick to standard section headings",
        paragraphs: ["Parsers look for familiar words. Creative headings like “My Journey” or “What I Bring” may not be recognised."],
        bullets: ["Summary (or Professional Summary)", "Skills (or Technical Skills)", "Experience", "Projects", "Education", "Certifications", "Achievements"],
      },
      {
        heading: "Avoid tables, text boxes, images and icons for content",
        paragraphs: [
          "Text inside tables, text boxes, headers, footers or images is often skipped or scrambled. Put your name, contact details and every skill in normal body text. Skill bars and star ratings carry no information a parser can read, so list skills as words instead.",
        ],
      },
      {
        heading: "Write dates consistently",
        paragraphs: ["Use one style throughout, such as “Jul 2024 – Present” or “07/2024 – Present”. Mixed styles make it harder to calculate your years of experience, which many job filters rely on."],
      },
      {
        heading: "Choose a clear font and a real PDF",
        paragraphs: [
          "Use a common, readable font at 10–12 pt. Export a text-based PDF (not a scanned image or a photo of your resume), or a Word file if the employer asks for one. A quick test: if you can select and copy the text in your PDF, a parser can usually read it too.",
        ],
      },
      {
        heading: "Match the job's wording, truthfully",
        paragraphs: [
          "Recruiters often search the ATS for specific skills. If the job says “PostgreSQL” and you've used it, write “PostgreSQL” rather than only “databases”. Show each important skill inside an experience or project bullet, not just in the skills list, so it's clear you've actually used it. Never add skills you don't have: interviews will find the gap quickly.",
        ],
      },
      {
        heading: "Quick checklist before you apply",
        bullets: [
          "Single column, standard headings",
          "Name, phone, email and city at the top, as normal text",
          "No tables, text boxes, images or skill bars",
          "Consistent dates on every role",
          "Key skills from the job description shown in real bullets",
          "Text-based PDF, file named like “Firstname_Lastname_Resume.pdf”",
        ],
      },
    ],
    faq: [
      { q: "Is a PDF or Word file better for ATS?", a: "Most modern systems read both. A text-based PDF keeps your layout exactly as designed; send Word only if the employer asks for it." },
      { q: "Can colours or a photo hurt my ATS score?", a: "A little colour in headings is fine. A photo adds nothing a parser can use, and in many countries, including India for most private jobs, it isn't expected." },
      { q: "Does an ATS reject resumes automatically?", a: "Usually not on its own; recruiters filter and search the results. A clean format makes sure your real skills show up when they do." },
    ],
  },
  {
    slug: "resume-for-freshers",
    title: "Resume for Freshers: Format, Sections and Examples",
    description:
      "How to write a fresher resume with no work experience: the best section order, how to describe projects and internships, and example bullet points.",
    h1: "Resume for freshers: format, sections and examples",
    intro:
      "As a fresher, recruiters know you won't have years of experience. What they look for is evidence you can do the work: projects, internships, skills you've actually used and results you can explain in an interview.",
    updated: "2026-10-27",
    sections: [
      {
        heading: "Best section order for a fresher",
        bullets: [
          "Name and contact details (phone, email, city, LinkedIn, GitHub or portfolio)",
          "Summary: two or three lines about the role you want and your strongest skills",
          "Technical skills, grouped (Languages, Frameworks, Databases, Tools)",
          "Projects: your main evidence, so put them early",
          "Internships or experience, if any",
          "Education with CGPA or percentage if it's good",
          "Certifications and achievements",
        ],
      },
      {
        heading: "Write projects like work experience",
        paragraphs: [
          "Give each project a clear name, the technologies used, and two or three bullets that say what you built, how, and what happened as a result. Link the code or a live demo if you can.",
        ],
        bullets: [
          "Built a resume builder in Next.js and PostgreSQL that exports ATS-friendly PDFs",
          "Added login and per-user data so each user only sees their own resumes",
          "Cut page load time from 3 s to 1 s by caching database queries",
        ],
      },
      {
        heading: "Use strong, honest bullet points",
        paragraphs: [
          "Start with an action verb (Built, Designed, Automated, Reduced, Led), say what you did, and add a number when you have a real one: users, time saved, accuracy, rank. If you don't have a number, describe the outcome plainly. Never invent figures.",
        ],
      },
      {
        heading: "Skills: fewer, real and grouped",
        paragraphs: [
          "List skills you could discuss in an interview, grouped by type. Skip ratings like “Java ★★★★☆”: they don't help ATS and invite tough questions. Mention your strongest skills again inside project bullets.",
        ],
      },
      {
        heading: "Keep it to one page",
        paragraphs: ["A fresher resume should fit on one clean page. Remove school-level details if space is tight (keep Class XII marks only if the employer asks), and drop hobbies unless they're relevant to the job."],
      },
      {
        heading: "Personal details: what to leave out",
        paragraphs: ["Date of birth, father's name, religion, marital status and a photo are not needed for most private-sector jobs and take space from your skills. Add them only if an employer specifically asks."],
      },
    ],
    faq: [
      { q: "What if I have no internship?", a: "Projects, hackathons, open-source contributions, college technical events and certifications all count. Describe them with the same structure as a job." },
      { q: "Should a fresher add a career objective?", a: "A short summary works better than a generic objective: name the role you want and your two or three strongest, proven skills." },
      { q: "How long should a fresher resume be?", a: "One page. Recruiters spend little time on each resume, so lead with your best evidence." },
    ],
  },
  {
    slug: "ats-resume-checker",
    title: "Free ATS Resume Checker: Test Your Resume Before You Apply",
    description:
      "Check if your resume is ATS-friendly for free. See what an ATS checker looks for, how scores work, and how to fix the most common problems.",
    h1: "Free ATS resume checker: test your resume before you apply",
    intro:
      "An ATS check shows how readable your resume is to the software many companies use to store and search applications. It can't promise interviews, but it catches the problems that quietly hide your experience.",
    updated: "2026-10-27",
    sections: [
      {
        heading: "What a good ATS check looks at",
        bullets: [
          "Contact details: name, phone and email present and readable",
          "Standard section headings the software recognises",
          "Dates that are consistent and in order",
          "Layout problems: columns, tables, text boxes, images, header/footer text",
          "Length, repetition and vague wording",
          "Spelling and skill-rating graphics",
        ],
      },
      {
        heading: "How to read your score",
        paragraphs: [
          "A score is only useful if it explains itself. Look for a checker that tells you exactly which rule cost points and how to fix it, so you can see the score improve as you edit. Treat it as a guide to clarity, not as a real employer's ATS score, which no outside tool can see.",
        ],
      },
      {
        heading: "Check against a specific job",
        paragraphs: [
          "Readability is step one. Step two is relevance: paste the job description and compare which required skills your resume actually shows evidence for. A skill demonstrated in an experience or project bullet is much stronger than one only listed under Skills.",
        ],
      },
      {
        heading: "The most common fixes",
        bullets: [
          "Move contact details out of the page header into the body",
          "Replace a two-column template with a single column",
          "Rename creative headings to standard ones",
          "Turn skill bars into a plain, grouped skills list",
          "Rewrite vague bullets (“Responsible for…”) into what you did and achieved",
        ],
      },
      {
        heading: "Try it free",
        paragraphs: [
          "Our builder shows an ATS readability score and a resume score as you type, explains every point, and lists the highest-impact fixes first. You can upload your existing PDF or Word resume, or build a new one step by step, then download the exact PDF you previewed.",
        ],
      },
    ],
    faq: [
      { q: "Is the ATS checker really free?", a: "Yes. Creating an account, building or uploading a resume, checking scores and downloading PDF or Word files are free." },
      { q: "Will a 100 ATS score get me shortlisted?", a: "No tool can promise that: people and different systems make the decisions. A high score means your resume is clear and readable, which removes avoidable problems." },
      { q: "Is my uploaded resume stored?", a: "Uploaded files are read in memory to extract the text and are not stored. Only the sections you choose to save are kept, and you can delete them any time." },
    ],
  },
  {
    slug: "software-engineer-resume",
    title: "Software Engineer Resume: Skills, Projects and Bullet Examples",
    description:
      "Write a software engineer resume that gets read: the right section order, how to group technical skills, and strong bullet point examples for developers.",
    h1: "Software engineer resume: skills, projects and bullet examples",
    intro:
      "Developer resumes are scanned quickly for three things: your stack, what you built with it, and the impact. Make all three easy to find in the first half of the page.",
    updated: "2026-10-27",
    sections: [
      {
        heading: "Section order that works",
        bullets: ["Summary (2–3 lines: role, years, main stack, one result)", "Technical Skills", "Experience", "Projects", "Education", "Certifications and achievements"],
      },
      {
        heading: "Group your technical skills",
        paragraphs: ["Groups make your stack readable at a glance and help recruiters searching for specific tools."],
        bullets: [
          "Languages: Java, Python, TypeScript, SQL",
          "Backend & Frameworks: Spring Boot, Node.js, Express",
          "Frontend: React, Next.js, Tailwind CSS",
          "Databases: PostgreSQL, MySQL, Redis",
          "Cloud & DevOps: AWS, Docker, GitHub Actions",
        ],
      },
      {
        heading: "Bullet points with impact",
        paragraphs: ["Use “action + what + how + result”. Bold one or two key words per bullet so a fast reader catches them."],
        bullets: [
          "Built 12 REST APIs in Spring Boot used by 3 internal teams to automate reporting",
          "Reduced dashboard load time from 4 s to 1.5 s by adding PostgreSQL indexes and caching",
          "Automated deployments with GitHub Actions and Docker, cutting release time from a day to 20 minutes",
          "Migrated a legacy module to React, improving page speed scores from 52 to 91",
        ],
      },
      {
        heading: "Projects that prove your skills",
        paragraphs: [
          "Pick two or three projects that match the jobs you want. Name the technologies, link the repository or demo, and describe one hard problem you solved. A small, finished, deployed project beats a long list of tutorials.",
        ],
      },
      {
        heading: "Tailor for each application",
        paragraphs: [
          "Keep one master resume and make a copy for each job. Reorder skills and projects to put the most relevant first, and use the job's exact names for technologies you genuinely know. Your master stays complete; each copy stays focused.",
        ],
      },
    ],
    faq: [
      { q: "Should I include GitHub on my resume?", a: "Yes, if it shows real work. Pin your best repositories and make sure each has a short README explaining what it does." },
      { q: "One page or two for developers?", a: "One page up to about five years of experience; two pages are fine for senior engineers with a lot of relevant work." },
      { q: "Do I need a summary?", a: "It's optional, but a short, specific summary helps recruiters place you quickly. Skip generic lines like “hard-working team player”." },
    ],
  },
];

export const guideBySlug = (slug: string) => GUIDES.find((g) => g.slug === slug);
