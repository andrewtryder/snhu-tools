export interface KualiConfig {
  baseUrl: string;
  catalogId: string;
  timeoutMs: number;
  userAgent: string;
}

export const kualiConfig: KualiConfig = {
  baseUrl: process.env.KUALI_BASE_URL || "https://snhu.kuali.co",
  catalogId: process.env.KUALI_CATALOG_ID || "6349a3f9164d00001c6c80da",
  timeoutMs: Number(process.env.KUALI_REQUEST_TIMEOUT_MS) || 10000,
  userAgent:
    process.env.KUALI_USER_AGENT ||
    "SNHU-Tools-Sync/1.0 (+https://github.com/andrewtryder/snhu-tools)",
};
