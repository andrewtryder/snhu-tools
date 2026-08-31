"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CourseSearchInput } from "./CourseSearchInput";

export function CourseSearchHeader({ initialQuery = "" }: { initialQuery?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);

  return (
    <CourseSearchInput
      value={query}
      onChange={setQuery}
      onSubmit={(ids) => {
        if (ids.length === 1) {
          router.push(`/courses/${ids[0]}`);
        } else if (ids.length > 1) {
          router.push(`/courses?ids=${ids.join(",")}`);
        }
      }}
      variant="compact"
      placeholder="Jump to course (e.g. CS330)..."
    />
  );
}
