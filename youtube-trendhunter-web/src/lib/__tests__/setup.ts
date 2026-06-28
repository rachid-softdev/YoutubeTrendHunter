import "@testing-library/jest-dom/vitest";

// Suppress Node.js experimental warnings for clean CI output.
// Vitest's `test.env` sets NODE_NO_WARNINGS, but this ensures runtime capture too.
const origEmitWarning = process.emitWarning;
process.emitWarning = (warning, ...args) => {
  // Filter out ExperimentalWarning — they clutter CI output with no value
  if (
    typeof warning === "string" &&
    (warning.includes("ExperimentalWarning") || warning.includes("experimental"))
  ) {
    return;
  }
  if (typeof warning === "object" && (warning as any)?.name === "ExperimentalWarning") {
    return;
  }
  // @ts-expect-error - rest args forwarding
  origEmitWarning(warning, ...args);
};
