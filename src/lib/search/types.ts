export type SearchDomain = "programs" | "courses" | "transfers";

export type GlobalSearchResult =
  | {
      type: "program";
      id: string;
      title: string;
      subtitle: string | null;
      href: string;
    }
  | {
      type: "course";
      id: string;
      title: string;
      subtitle: string | null;
      href: string;
    }
  | {
      type: "transfer";
      id: string;
      title: string;
      subtitle: string | null;
      href: string;
      optionCount: number;
    };

export interface GlobalSearchGroupedResults {
  programs: GlobalSearchResult[];
  courses: GlobalSearchResult[];
  transfers: GlobalSearchResult[];
}

export interface GlobalSearchCounts {
  programs: number;
  courses: number;
  transfers: number;
  total: number;
}

export interface GlobalSearchResponse {
  query: string;
  results: GlobalSearchGroupedResults;
  counts: GlobalSearchCounts;
  unavailable?: SearchDomain[];
  /** True when results are empty because data sources were unavailable (not a real miss). */
  degraded?: boolean;
}

export interface SearchOptions {
  limit?: number;
}
