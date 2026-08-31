import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CourseSearchInput } from "@/features/courses/components/CourseSearchInput";

describe("CourseSearchInput component", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Combobox Accessibility", () => {
    it("renders with combobox semantics and accessible labels", () => {
      render(
        <CourseSearchInput
          value=""
          onChange={vi.fn()}
          onSubmit={vi.fn()}
          variant="inline"
        />,
      );

      const input = screen.getByRole("combobox", {
        name: "Search SNHU courses by course ID",
      });
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute("aria-expanded", "false");
      expect(input).toHaveAttribute("aria-autocomplete", "list");
    });

    it("opens suggestions on focus when active token exists and closes on blur", async () => {
      const mockSuggestions = [
        { catalog_course_id: "CS110", title: "Intro to Computer Science" },
      ];

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => mockSuggestions,
      } as Response);

      render(
        <CourseSearchInput
          value="CS"
          onChange={vi.fn()}
          onSubmit={vi.fn()}
          variant="inline"
        />,
      );

      const input = screen.getByRole("combobox");
      fireEvent.focus(input);

      const option = await screen.findByRole("option", { name: /CS110/ });
      expect(option).toBeInTheDocument();
      expect(input).toHaveAttribute("aria-expanded", "true");

      // Blur closes combobox
      fireEvent.blur(input);

      await waitFor(() => {
        expect(input).toHaveAttribute("aria-expanded", "false");
      });
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });

    it("navigates suggestions with ArrowDown, updates aria-activedescendant, and closes with Escape", async () => {
      const mockSuggestions = [
        { catalog_course_id: "CS110", title: "Intro to Computer Science" },
        { catalog_course_id: "CS210", title: "Software Development" },
      ];

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => mockSuggestions,
      } as Response);

      render(
        <CourseSearchInput
          value="CS"
          onChange={vi.fn()}
          onSubmit={vi.fn()}
          variant="inline"
        />,
      );

      const input = screen.getByRole("combobox");
      fireEvent.focus(input);

      const option1 = await screen.findByRole("option", { name: /CS110/ });
      expect(option1).toBeInTheDocument();

      // Press ArrowDown
      fireEvent.keyDown(input, { key: "ArrowDown" });
      expect(input).toHaveAttribute("aria-activedescendant", option1.id);
      expect(option1).toHaveAttribute("aria-selected", "true");

      // Press ArrowDown again
      fireEvent.keyDown(input, { key: "ArrowDown" });
      const option2 = screen.getByRole("option", { name: /CS210/ });
      expect(input).toHaveAttribute("aria-activedescendant", option2.id);
      expect(option2).toHaveAttribute("aria-selected", "true");

      // Press Escape to close
      fireEvent.keyDown(input, { key: "Escape" });
      expect(input).toHaveAttribute("aria-expanded", "false");
    });
  });

  describe("Autocomplete API Requests", () => {
    it("debounces autocomplete fetch and displays accessible error on failure", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Search failed" }),
      } as Response);

      render(
        <CourseSearchInput
          value="BIO"
          onChange={vi.fn()}
          onSubmit={vi.fn()}
          variant="inline"
        />,
      );

      const input = screen.getByRole("combobox");
      fireEvent.focus(input);

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          "/api/courses/search?q=BIO&limit=25",
          expect.any(Object),
        );
      });

      await waitFor(() => {
        expect(screen.getAllByText("Search failed").length).toBeGreaterThan(0);
      });
    });
  });

  describe("Mouse Selection and Form Submission", () => {
    it("selects suggestion on mouse click and triggers submit for single course", async () => {
      const onSubmit = vi.fn();
      const onChange = vi.fn();

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => [{ catalog_course_id: "CS300", title: "Data Structures" }],
      } as Response);

      render(
        <CourseSearchInput
          value="CS"
          onChange={onChange}
          onSubmit={onSubmit}
          variant="inline"
        />,
      );

      const input = screen.getByRole("combobox");
      fireEvent.focus(input);

      const option = await screen.findByRole("option", { name: /CS300/ });

      // Ensure mousedown event default is prevented so blur doesn't steal focus
      const mouseDownEvent = fireEvent.mouseDown(option);
      expect(mouseDownEvent).toBe(false); // defaultPrevented

      // Click option
      fireEvent.click(option);

      expect(onChange).toHaveBeenCalledWith("CS300");
      expect(onSubmit).toHaveBeenCalledWith(["CS300"]);
    });

    it("supports submitting via the explicit Search button for inline variant", () => {
      const onSubmit = vi.fn();

      render(
        <CourseSearchInput
          value="CS330, CS350"
          onChange={vi.fn()}
          onSubmit={onSubmit}
          variant="inline"
        />,
      );

      const searchBtn = screen.getByRole("button", { name: "Search courses" });
      expect(searchBtn).toBeEnabled();

      fireEvent.click(searchBtn);
      expect(onSubmit).toHaveBeenCalledWith(["CS330", "CS350"]);
    });

    it("disables search button when input is empty or loading", () => {
      const { rerender } = render(
        <CourseSearchInput
          value=""
          onChange={vi.fn()}
          onSubmit={vi.fn()}
          variant="inline"
        />,
      );

      const searchBtn = screen.getByRole("button", { name: "Search courses" });
      expect(searchBtn).toBeDisabled();

      rerender(
        <CourseSearchInput
          value="CS100"
          onChange={vi.fn()}
          onSubmit={vi.fn()}
          isLoading={true}
          variant="inline"
        />,
      );

      const loadingBtn = screen.getByRole("button", { name: "Searching courses" });
      expect(loadingBtn).toBeDisabled();
    });
  });
});
