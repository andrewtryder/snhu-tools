import "@testing-library/jest-dom/vitest";

// Fixture snapshots are an explicit test-only opt-in; production/preview tests override this.
process.env.ALLOW_FIXTURE_SNAPSHOTS = "true";

// Mock ResizeObserver for React Flow in JSDOM tests
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
