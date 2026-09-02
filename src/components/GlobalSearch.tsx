"use client";

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, GraduationCap, BookOpen, ArrowRightLeft } from "lucide-react";
import type { GlobalSearchResult, GlobalSearchResponse } from "@/lib/search/types";

interface GlobalSearchProps {
  className?: string;
  placeholder?: string;
}

function getItemId(listboxId: string, index: number): string {
  return `${listboxId}-item-${index}`;
}

export function GlobalSearch({
  className = "",
  placeholder = "Search programs, courses, or transfer options...",
}: GlobalSearchProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [data, setData] = useState<GlobalSearchResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  const trimmedQuery = query.trim();

  // Derived state to avoid setState in effect body
  const activeData = trimmedQuery.length < 2 ? null : data;
  const activeError = trimmedQuery.length < 2 ? null : error;
  const activeLoading = trimmedQuery.length < 2 ? false : isLoading;

  // Flattened array of all visible results for keyboard arrow navigation
  const flatResults = useMemo<GlobalSearchResult[]>(() => {
    if (!activeData?.results || trimmedQuery.length < 2) return [];
    return [
      ...activeData.results.programs,
      ...activeData.results.courses,
      ...activeData.results.transfers,
    ];
  }, [activeData, trimmedQuery]);

  const showDropdown =
    isOpen &&
    isFocused &&
    trimmedQuery.length >= 2 &&
    (activeLoading || !!activeError || flatResults.length > 0 || (activeData !== null && flatResults.length === 0));

  const activeDescendantId =
    highlightedIndex >= 0 && highlightedIndex < flatResults.length
      ? getItemId(listboxId, highlightedIndex)
      : undefined;

  // Handle autocomplete fetch with debounce and abort control
  useEffect(() => {
    if (trimmedQuery.length < 2) {
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIsLoading(true);
      setError(null);

      try {
        const res = await fetch(
          `/api/global-search?q=${encodeURIComponent(trimmedQuery)}&limit=5`,
          { signal: controller.signal }
        );

        if (!res.ok) {
          setError("Search suggestions unavailable");
          setData(null);
          return;
        }

        const json: GlobalSearchResponse = await res.json();
        setData(json);
        setIsOpen(true);
        setHighlightedIndex(-1);
      } catch (err: unknown) {
        if ((err as Error).name !== "AbortError") {
          setError("Search suggestions unavailable");
          setData(null);
        }
      } finally {
        setIsLoading(false);
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmedQuery]);

  // Outside click listener
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const navigateToResult = useCallback(
    (result: GlobalSearchResult) => {
      setIsOpen(false);
      router.push(result.href);
    },
    [router]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (highlightedIndex >= 0 && highlightedIndex < flatResults.length) {
      navigateToResult(flatResults[highlightedIndex]);
      return;
    }

    if (trimmedQuery.length > 0) {
      setIsOpen(false);
      router.push(`/search?q=${encodeURIComponent(trimmedQuery)}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown) {
      if (e.key === "ArrowDown" && flatResults.length > 0) {
        setIsOpen(true);
        setHighlightedIndex(0);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case "Enter":
        if (highlightedIndex >= 0 && highlightedIndex < flatResults.length) {
          e.preventDefault();
          navigateToResult(flatResults[highlightedIndex]);
        }
        break;
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < flatResults.length - 1 ? prev + 1 : 0
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : flatResults.length - 1
        );
        break;
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        setHighlightedIndex(-1);
        break;
      case "Tab":
        setIsOpen(false);
        break;
    }
  };

  // Compute running flat index offset for each section
  const programs = data?.results.programs ?? [];
  const courses = data?.results.courses ?? [];
  const transfers = data?.results.transfers ?? [];

  const programOffset = 0;
  const courseOffset = programs.length;
  const transferOffset = programs.length + courses.length;

  return (
    <div ref={containerRef} className={`relative w-full min-w-0 ${className}`}>
      <form onSubmit={handleSubmit} role="search" className="relative w-full min-w-0">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-outline"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          type="search"
          name="q"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            setIsFocused(true);
            if (trimmedQuery.length >= 2) setIsOpen(true);
          }}
          onBlur={() => {
            setIsFocused(false);
          }}
          onKeyDown={handleKeyDown}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showDropdown}
          aria-controls={listboxId}
          aria-activedescendant={activeDescendantId}
          aria-label="Search SNHU programs, courses, and transfer options"
          className="w-full rounded-full border border-outline-variant bg-surface-container-low py-2 pl-10 pr-10 text-sm text-on-surface outline-none transition-all placeholder:text-on-surface-variant focus:border-primary focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-surface"
          placeholder={placeholder}
          autoComplete="off"
        />

        {isLoading && (
          <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
            <Loader2 className="h-4 w-4 animate-spin text-outline" aria-hidden="true" />
          </div>
        )}
      </form>

      {showDropdown && (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Search suggestions"
          className="absolute left-0 right-0 z-50 mt-1.5 max-h-[70vh] overflow-y-auto rounded-xl border border-surface-variant bg-surface-container-lowest p-2 shadow-lg backdrop-blur-md"
        >
          {error ? (
            <div className="p-3 text-center text-xs text-on-surface-variant">
              {error}
            </div>
          ) : flatResults.length === 0 && !isLoading ? (
            <div className="p-3 text-center text-xs text-on-surface-variant">
              No suggestions found. Press Enter to search all results.
            </div>
          ) : (
            <div className="space-y-3">
              {/* Programs Group */}
              {programs.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 px-2 py-1 text-xs font-bold uppercase tracking-wider text-primary">
                    <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Degree Programs</span>
                  </div>
                  <div className="mt-0.5 space-y-0.5">
                    {programs.map((item, idx) => {
                      const flatIndex = programOffset + idx;
                      const isHighlighted = highlightedIndex === flatIndex;
                      return (
                        <div
                          key={item.id}
                          id={getItemId(listboxId, flatIndex)}
                          role="option"
                          aria-selected={isHighlighted}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            navigateToResult(item);
                          }}
                          onMouseEnter={() => setHighlightedIndex(flatIndex)}
                          className={`flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
                            isHighlighted
                              ? "bg-primary/10 text-primary font-medium"
                              : "text-on-surface hover:bg-surface-container"
                          }`}
                        >
                          <span className="truncate">{item.title}</span>
                          {item.subtitle && (
                            <span className="ml-2 shrink-0 text-xs text-on-surface-variant">
                              {item.subtitle}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Courses Group */}
              {courses.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 px-2 py-1 text-xs font-bold uppercase tracking-wider text-secondary">
                    <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Courses</span>
                  </div>
                  <div className="mt-0.5 space-y-0.5">
                    {courses.map((item, idx) => {
                      const flatIndex = courseOffset + idx;
                      const isHighlighted = highlightedIndex === flatIndex;
                      return (
                        <div
                          key={item.id}
                          id={getItemId(listboxId, flatIndex)}
                          role="option"
                          aria-selected={isHighlighted}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            navigateToResult(item);
                          }}
                          onMouseEnter={() => setHighlightedIndex(flatIndex)}
                          className={`flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
                            isHighlighted
                              ? "bg-secondary/10 text-secondary font-medium"
                              : "text-on-surface hover:bg-surface-container"
                          }`}
                        >
                          <span className="font-mono text-xs font-bold">{item.title}</span>
                          {item.subtitle && (
                            <span className="ml-2 truncate text-xs text-on-surface-variant">
                              {item.subtitle}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Transfers Group */}
              {transfers.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 px-2 py-1 text-xs font-bold uppercase tracking-wider text-tertiary">
                    <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Transfer Options</span>
                  </div>
                  <div className="mt-0.5 space-y-0.5">
                    {transfers.map((item, idx) => {
                      const flatIndex = transferOffset + idx;
                      const isHighlighted = highlightedIndex === flatIndex;
                      return (
                        <div
                          key={item.id}
                          id={getItemId(listboxId, flatIndex)}
                          role="option"
                          aria-selected={isHighlighted}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            navigateToResult(item);
                          }}
                          onMouseEnter={() => setHighlightedIndex(flatIndex)}
                          className={`flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
                            isHighlighted
                              ? "bg-tertiary/10 text-tertiary font-medium"
                              : "text-on-surface hover:bg-surface-container"
                          }`}
                        >
                          <span className="font-mono text-xs font-bold">{item.title}</span>
                          <span className="ml-2 shrink-0 text-xs text-on-surface-variant">
                            {item.subtitle}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="border-t border-surface-variant/60 pt-2 text-center">
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (trimmedQuery.length > 0) {
                      setIsOpen(false);
                      router.push(`/search?q=${encodeURIComponent(trimmedQuery)}`);
                    }
                  }}
                  className="w-full text-center text-xs font-medium text-primary hover:underline"
                >
                  See all results for &ldquo;{trimmedQuery}&rdquo; &rarr;
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
