const LIST_EXPERIENCES_URL =
  'https://snhu.kuali.co/api/v1/catalog/experiences/62d0386e064ce7001cec61d1?q=';
const EXPERIENCE_DETAIL_URL_PREFIX =
  'https://snhu.kuali.co/api/v1/catalog/experience/62d0386e064ce7001cec61d1/';

export interface KualiExperienceListItem {
  pid?: string;
  title?: string;
  [key: string]: unknown;
}

export interface KualiExperienceDetail {
  pid?: string;
  title?: string;
  eligibilityTimeframe?: string;
  rulesAchievementCriteria?: string;
  groupFilter2?: { name?: string };
  academicLevel?: { name?: string };
  [key: string]: unknown;
}

async function fetchWithRetry<T>(url: string, retries = 3): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return (await response.json()) as T;
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  throw new Error(`Failed to fetch ${url}`);
}

export async function fetchExperiences(): Promise<KualiExperienceListItem[]> {
  const experiences = await fetchWithRetry<KualiExperienceListItem[]>(LIST_EXPERIENCES_URL);
  if (!experiences || experiences.length === 0) {
    throw new Error('Failed to fetch experiences from Kuali (empty or null)');
  }
  return experiences;
}

export async function fetchExperienceDetail(
  pid: string
): Promise<KualiExperienceDetail | null> {
  try {
    return await fetchWithRetry<KualiExperienceDetail>(
      `${EXPERIENCE_DETAIL_URL_PREFIX}${pid}`
    );
  } catch (error) {
    console.error(`Failed to fetch experience detail for PID: ${pid}`, error);
    return null;
  }
}
