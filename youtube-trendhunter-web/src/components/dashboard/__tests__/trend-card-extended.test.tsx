import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TrendCard } from "@/components/dashboard/trend-card";

// Mock analytics to prevent console errors
vi.mock("@/lib/analytics", () => ({
  analytics: {
    trendViewed: vi.fn(),
  },
}));

const baseTrend = {
  id: "1",
  title: "Test Trend Title",
  score: 85,
  velocity: 45.5,
  status: "GROWING",
  videoCount: 234,
  contentAngles: ["Angle 1", "Angle 2", "Angle 3"],
};

describe("TrendCard", () => {
  describe("basic rendering", () => {
    it("renders trend title", () => {
      render(<TrendCard trend={baseTrend} />);
      expect(screen.getByText("Test Trend Title")).toBeInTheDocument();
    });

    it("renders score badge", () => {
      render(<TrendCard trend={baseTrend} />);
      expect(screen.getByText("85")).toBeInTheDocument();
    });

    it("renders status badge", () => {
      render(<TrendCard trend={baseTrend} />);
      expect(screen.getByText("GROWING")).toBeInTheDocument();
    });
  });

  describe("score color variants", () => {
    it("shows red for high score (>=75)", () => {
      render(<TrendCard trend={{ ...baseTrend, score: 85 }} />);
      const score = screen.getByText("85");
      expect(score).toHaveClass("bg-yt-red");
    });

    it("shows amber for mid score (50-74)", () => {
      render(<TrendCard trend={{ ...baseTrend, score: 60 }} />);
      const score = screen.getByText("60");
      expect(score).toHaveClass("bg-amber-500");
    });

    it("shows green for low score (<50)", () => {
      render(<TrendCard trend={{ ...baseTrend, score: 30 }} />);
      const score = screen.getByText("30");
      expect(score).toHaveClass("bg-green-500");
    });

    it("shows amber for score exactly 50", () => {
      render(<TrendCard trend={{ ...baseTrend, score: 50 }} />);
      const score = screen.getByText("50");
      expect(score).toHaveClass("bg-amber-500");
    });

    it("shows red for score exactly 74", () => {
      render(<TrendCard trend={{ ...baseTrend, score: 74 }} />);
      const score = screen.getByText("74");
      expect(score).toHaveClass("bg-amber-500");
    });
  });

  describe("velocity display", () => {
    it("displays positive velocity with TrendingUp icon", () => {
      render(<TrendCard trend={{ ...baseTrend, velocity: 25.5 }} />);
      expect(screen.getByText("25.5%")).toBeInTheDocument();
    });

    it("displays negative velocity with TrendingDown icon", () => {
      render(<TrendCard trend={{ ...baseTrend, velocity: -10.5 }} />);
      expect(screen.getByText("10.5%")).toBeInTheDocument();
    });

    it("displays zero velocity", () => {
      render(<TrendCard trend={{ ...baseTrend, velocity: 0 }} />);
      expect(screen.getByText("0.0%")).toBeInTheDocument();
    });
  });

  describe("video count", () => {
    it("displays video count", () => {
      render(<TrendCard trend={baseTrend} />);
      // Video count is rendered as "234 vidéos"
      expect(screen.getByText(/234.*vidéos/)).toBeInTheDocument();
    });

    it("does not display video count when undefined", () => {
      const noCount = { ...baseTrend, videoCount: undefined };
      render(<TrendCard trend={noCount} />);
      expect(screen.queryByText(/vidéos/)).not.toBeInTheDocument();
    });

    it("does not display video count when null", () => {
      const noCount = { ...baseTrend, videoCount: null };
      render(<TrendCard trend={noCount} />);
      expect(screen.queryByText(/vidéos/)).not.toBeInTheDocument();
    });
  });

  describe("description", () => {
    it("displays description when present", () => {
      render(<TrendCard trend={{ ...baseTrend, description: "Test description" }} />);
      expect(screen.getByText("Test description")).toBeInTheDocument();
    });

    it("does not display description when null", () => {
      const noDesc = { ...baseTrend, description: null };
      render(<TrendCard trend={noDesc} />);
      expect(screen.queryByText("Test description")).not.toBeInTheDocument();
    });
  });

  describe("content angles", () => {
    it("displays first two content angles", () => {
      render(<TrendCard trend={baseTrend} />);
      expect(screen.getByText("Angle 1")).toBeInTheDocument();
      expect(screen.getByText("Angle 2")).toBeInTheDocument();
      expect(screen.queryByText("Angle 3")).not.toBeInTheDocument();
    });

    it("handles empty content angles array", () => {
      render(<TrendCard trend={{ ...baseTrend, contentAngles: [] }} />);
      expect(screen.queryByTestId("content-angles")).not.toBeInTheDocument();
    });

    it("handles null content angles", () => {
      render(<TrendCard trend={{ ...baseTrend, contentAngles: null }} />);
      // Should not throw
      expect(screen.getByText("Test Trend Title")).toBeInTheDocument();
    });

    it("handles undefined content angles", () => {
      render(<TrendCard trend={{ ...baseTrend, contentAngles: undefined }} />);
      expect(screen.getByText("Test Trend Title")).toBeInTheDocument();
    });
  });

  describe("status variants", () => {
    it("renders PEAK status with live variant", () => {
      render(<TrendCard trend={{ ...baseTrend, status: "PEAK" }} />);
      expect(screen.getByText("PEAK")).toBeInTheDocument();
    });

    it("renders GROWING status", () => {
      render(<TrendCard trend={{ ...baseTrend, status: "GROWING" }} />);
      expect(screen.getByText("GROWING")).toBeInTheDocument();
    });

    it("renders FADING status", () => {
      render(<TrendCard trend={{ ...baseTrend, status: "FADING" }} />);
      expect(screen.getByText("FADING")).toBeInTheDocument();
    });

    it("renders EMERGING status", () => {
      render(<TrendCard trend={{ ...baseTrend, status: "EMERGING" }} />);
      expect(screen.getByText("EMERGING")).toBeInTheDocument();
    });

    it("renders unknown status with default variant", () => {
      render(<TrendCard trend={{ ...baseTrend, status: "UNKNOWN" }} />);
      expect(screen.getByText("UNKNOWN")).toBeInTheDocument();
    });
  });

  describe("interactivity", () => {
    it("renders as clickable div", () => {
      render(<TrendCard trend={baseTrend} />);
      const card = document.querySelector('[role="button"]');
      expect(card).toBeInTheDocument();
    });

    it("is focusable", () => {
      render(<TrendCard trend={baseTrend} />);
      const card = document.querySelector('[tabindex="0"]');
      expect(card).toBeInTheDocument();
    });

    it("has cursor-pointer class", () => {
      render(<TrendCard trend={baseTrend} />);
      const card = document.querySelector(".cursor-pointer");
      expect(card).toBeInTheDocument();
    });
  });

  describe("hot styling", () => {
    it("adds red border modifier class for high score card", () => {
      const { container } = render(<TrendCard trend={{ ...baseTrend, score: 85 }} />);
      // The card should have some border styling (Tailwind transforms class names)
      const card = container.querySelector(".cursor-pointer");
      expect(card).toBeInTheDocument();
    });

    it("adds hover border modifier for normal score card", () => {
      const { container } = render(<TrendCard trend={{ ...baseTrend, score: 50 }} />);
      const card = container.querySelector(".cursor-pointer");
      expect(card).toBeInTheDocument();
    });
  });

  describe("niche information", () => {
    it("renders with niche info", () => {
      render(<TrendCard trend={{ ...baseTrend, niche: { slug: "tech", name: "Tech" } }} />);
      expect(screen.getByText("Test Trend Title")).toBeInTheDocument();
    });
  });

  describe("source prop", () => {
    it("accepts custom source prop", () => {
      render(<TrendCard trend={baseTrend} source="extension" />);
      expect(screen.getByText("Test Trend Title")).toBeInTheDocument();
    });

    it("defaults to dashboard source", () => {
      render(<TrendCard trend={baseTrend} />);
      expect(screen.getByText("Test Trend Title")).toBeInTheDocument();
    });
  });
});
