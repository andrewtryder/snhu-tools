import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CourseSearchHeader } from "@/features/courses/components/CourseSearchHeader";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

describe("CourseSearchHeader component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("routes to /courses/[id] when single course is submitted", () => {
    render(<CourseSearchHeader />);

    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "CS330" } });
    fireEvent.submit(input.closest("form")!);

    expect(pushMock).toHaveBeenCalledWith("/courses/CS330");
  });

  it("routes to /courses?ids=... when multiple courses are submitted", () => {
    render(<CourseSearchHeader />);

    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "CS330, CS350" } });
    fireEvent.submit(input.closest("form")!);

    expect(pushMock).toHaveBeenCalledWith("/courses?ids=CS330,CS350");
  });
});
