export interface Persona {
  id: string;
  icon: string;
  role: string;
  title: string;
  description: string;
  tags: string[];
}

export const CURATED_PERSONAS: Persona[] = [
  {
    id: "local-market-analyst",
    icon: "📊",
    role: "Local Market Analyst",
    title: "Competitive Pricing Monitor",
    description:
      "Scrapes competitor pricing, reviews, and positioning for med spas, salons, and local services. Delivers a weekly competitive brief with pricing gaps and promotional opportunities.",
    tags: ["Pricing Scraper", "Competitive Intel", "Local SEO"],
  },
  {
    id: "b2b-sales-strategist",
    icon: "📧",
    role: "B2B Sales Strategist",
    title: "Cold Outreach Rewriter",
    description:
      "Analyzes target company docs, job posts, and recent news to rewrite outreach sequences that sound bespoke. Turns generic templates into account-specific pitches that get replies.",
    tags: ["Cold Email", "Account Research", "Copywriting"],
  },
  {
    id: "headless-commerce-architect",
    icon: "🛒",
    role: "Headless Commerce Architect",
    title: "Shopify / Next.js Stack Review",
    description:
      "Audits headless storefront architecture for performance, SEO, and conversion leaks. Maps every critical path from product view to checkout and flags optimization opportunities.",
    tags: ["Shopify", "Next.js", "Conversion"],
  },
  {
    id: "devops-security-reviewer",
    icon: "🛡️",
    role: "DevOps Security Reviewer",
    title: "CodeQL & Infrastructure Audit",
    description:
      "Runs static analysis, dependency audits, and infrastructure posture reviews. Surfaces critical vulnerabilities, misconfigurations, and remediation steps in an operator-ready format.",
    tags: ["CodeQL", "Infrastructure", "Compliance"],
  },
];

export const ROSTER_VISIBLE_COUNT = 3;
