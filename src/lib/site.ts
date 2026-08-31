import { getSiteUrl } from "@/lib/siteUrl";

export const siteConfig = {
  name: "SNHU Tools",
  shortDescription: "Unofficial degree-planning, course-prerequisite, and transfer-equivalency tools for SNHU.",
  description:
    "Explore unofficial SNHU degree maps with program requirements, course relationships, and interactive prerequisite graphs based on published catalog data.",
  get url() {
    return getSiteUrl();
  },
  repository: "https://github.com/andrewtryder/snhu-tools",
};
