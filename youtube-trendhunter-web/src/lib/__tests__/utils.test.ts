import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

describe("cn()", () => {
  it("merges single class", () => {
    expect(cn("foo")).toBe("foo");
  });

  it("merges multiple classes", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional classes", () => {
    expect(cn("base", false && "hidden", "visible")).toBe("base visible");
  });

  it("merges tailwind conflicts correctly", () => {
    expect(cn("px-4", "px-6")).toBe("px-6");
  });

  it("handles undefined values", () => {
    expect(cn("foo", undefined, "bar")).toBe("foo bar");
  });
});
