import { getSiteUrl } from "@/lib/siteUrl";

export const siteConfig = {
  name: "SNHU Tools",
  shortDescription: "Unofficial degree-planning, course-prerequisite, and transfer-equivalency tools for SNHU.",
  description:
    "Explore unofficial SNHU degree programs, course prerequisites, and transfer equivalencies using published catalog data.",
  get url() {
    return getSiteUrl();
  },
  repository: "https://github.com/andrewtryder/snhu-tools",
};

export const GITHUB_REPO_URL = siteConfig.repository;
