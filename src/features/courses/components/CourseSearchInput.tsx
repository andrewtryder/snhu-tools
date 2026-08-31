"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { normalizeCourseId } from "../lib/courseIds";

interface CourseSuggestion {
  catalog_course_id: string;
  title: string;
}

interface CourseSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (courseIds: string[]) => void;
  isLoading?: boolean;
  variant?: "inline" | "compact";
  placeholder?: string;
}

function getActiveToken(value: string): string {
  const parts = value.split(",");
  return parts[parts.length - 1].trim();
}

function replaceActiveToken(
  value: string,
  replacement: string,
): { nextValue: string; isFirstCourse: boolean } {
  const commaIndex = value.lastIndexOf(",");
  if (commaIndex === -1) {
    return { nextValue: replacement, isFirstCourse: true };
  }
  const prefix = value.slice(0, commaIndex + 1);
  return { nextValue: `${prefix} ${replacement}`, isFirstCourse: false };
}

function optionId(listboxId: string, courseId: string): string {
  return `${listboxId}-option-${courseId.replace(/[^a-zA-Z0-9-]/g, "-")}`;
}

export function CourseSearchInput({
  value,
  onChange,
  onSubmit,
  isLoading = false,
  variant = "inline",
  placeholder = "Search by course ID (e.g. CS499, ACC201)",
}: CourseSearchInputProps) {
  const [suggestions, setSuggestions] = useState<CourseSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  const activeToken = getActiveToken(value);
  const isCompact = variant === "compact";
  const visibleSuggestions = activeToken.length < 1 ? [] : suggestions;
  const dropdownOpen = isOpen && isFocused && activeToken.length >= 1;
  const visibleSearchError = activeToken.length < 1 ? null : searchError;
  const activeDescendantId =
    highlightedIndex >= 0 && visibleSuggestions[highlightedIndex]
      ? optionId(listboxId, visibleSuggestions[highlightedIndex].catalog_course_id)
      : undefined;

  useEffect(() => {
    const controller = new AbortController();

    const timeout = setTimeout(async () => {
      if (!isFocused || activeToken.length < 1) {
        setIsOpen(false);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      setIsOpen(true);
      setSearchError(null);
      try {
        const response = await fetch(
          `/api/courses/search?q=${encodeURIComponent(activeToken)}&limit=25`,
          { signal: controller.signal },
        );
        if (!response.ok) {
          const errData = await response.json().catch(() => null);
          setSuggestions([]);
          setSearchError(
            typeof errData?.error === "string"
              ? errData.error
              : "Course search is temporarily unavailable.",
          );
          return;
        }
        const data: CourseSuggestion[] = await response.json();
        setSuggestions(data);
        setHighlightedIndex(-1);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setSuggestions([]);
          setSearchError("Course search is temporarily unavailable.");
        }
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [activeToken, isFocused]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectSuggestion = useCallback(
    (suggestion: CourseSuggestion) => {
      const { nextValue, isFirstCourse } = replaceActiveToken(value, suggestion.catalog_course_id);
      onChange(nextValue);
      setIsOpen(false);
      setSuggestions([]);

      if (isFirstCourse) {
        setIsFocused(false);
        inputRef.current?.blur();
        onSubmit([normalizeCourseId(suggestion.catalog_course_id)]);
      } else {
        inputRef.current?.focus();
      }
    },
    [onChange, onSubmit, value],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsOpen(false);

    const courseIds = value
      .split(",")
      .map((id) => normalizeCourseId(id))
      .filter(Boolean);

    if (courseIds.length > 0) {
      setIsFocused(false);
      inputRef.current?.blur();
      onSubmit(courseIds);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!dropdownOpen || visibleSuggestions.length === 0) {
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % visibleSuggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev <= 0 ? visibleSuggestions.length - 1 : prev - 1));
    } else if (e.key === "Enter" && highlightedIndex >= 0) {
      e.preventDefault();
      selectSuggestion(visibleSuggestions[highlightedIndex]);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={isCompact ? "w-full max-w-md" : "w-full max-w-xl"}>
      <div ref={containerRef} className="relative flex items-center">
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {isSearching
            ? "Searching..."
            : visibleSearchError
              ? visibleSearchError
              : dropdownOpen && !isSearching && visibleSuggestions.length === 0
                ? "No matching courses found."
                : dropdownOpen && visibleSuggestions.length > 0
                  ? `${visibleSuggestions.length} suggestions available. Use up and down arrows to navigate.`
                  : ""}
        </div>
        <Search
          className={`absolute left-3.5 z-10 text-on-surface-variant/70 ${
            isCompact ? "h-4 w-4" : "h-5 w-5"
          }`}
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label="Search SNHU courses by course ID"
          aria-expanded={dropdownOpen}
          aria-autocomplete="list"
          aria-controls={visibleSuggestions.length > 0 ? listboxId : undefined}
          aria-activedescendant={activeDescendantId}
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            if (!isOpen && isFocused) {
              setIsOpen(true);
            }
          }}
          onFocus={() => {
            setIsFocused(true);
            if (activeToken.length >= 1) {
              setIsOpen(true);
            }
          }}
          onBlur={() => {
            setIsFocused(false);
            setIsOpen(false);
          }}
          onKeyDown={handleKeyDown}
          className={`w-full rounded-lg border border-outline-variant bg-surface-container-lowest pl-10 text-on-surface placeholder:text-on-surface-variant/60 shadow-xs transition-colors focus:border-primary focus:outline-hidden focus:ring-2 focus:ring-primary/20 ${
            isCompact ? "py-2 pr-10 text-sm" : "py-2.5 pr-24 text-base"
          }`}
        />
        {!isCompact && (
          <button
            type="submit"
            disabled={isLoading || !value.trim()}
            aria-label={isLoading ? "Searching courses" : "Search courses"}
            className="absolute right-2 rounded-md bg-primary px-3 py-1 text-xs font-semibold text-on-primary shadow-xs transition-colors hover:bg-primary-container disabled:opacity-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            {isLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              "Search"
            )}
          </button>
        )}
        {isCompact && (isLoading || isSearching) && (
          <Loader2
            className="absolute right-3.5 z-10 h-4 w-4 animate-spin text-primary"
            aria-hidden="true"
          />
        )}

        {dropdownOpen && (
          <div
            id={listboxId}
            role="listbox"
            aria-label="Course suggestions"
            className="absolute top-full z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-surface-variant bg-surface-container-lowest py-1 shadow-lg"
          >
            {visibleSearchError ? (
              <div className="px-4 py-2.5 text-sm text-error">{visibleSearchError}</div>
            ) : isSearching && visibleSuggestions.length === 0 ? (
              <div className="px-4 py-2.5 text-sm text-on-surface-variant">Searching...</div>
            ) : visibleSuggestions.length === 0 ? (
              <div className="px-4 py-2.5 text-sm text-on-surface-variant">
                No matching courses found.
              </div>
            ) : (
              visibleSuggestions.map((suggestion, index) => {
                const isSelected = index === highlightedIndex;
                return (
                  <div
                    key={suggestion.catalog_course_id}
                    id={optionId(listboxId, suggestion.catalog_course_id)}
                    role="option"
                    aria-selected={isSelected}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectSuggestion(suggestion)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={`cursor-pointer px-4 py-2 text-sm transition-colors ${
                      isSelected
                        ? "bg-surface-container-high text-primary font-semibold"
                        : "text-on-surface hover:bg-surface-container"
                    }`}
                  >
                    <span className="font-semibold">{suggestion.catalog_course_id}</span>
                    {suggestion.title && (
                      <span className="ml-2 text-on-surface-variant">— {suggestion.title}</span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </form>
  );
}
