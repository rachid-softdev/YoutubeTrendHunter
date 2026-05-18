import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { TrendCard } from "@/components/dashboard/trend-card"

const baseTrend = {
  id: "1",
  title: "Investir dans l'or",
  score: 85,
  velocity: 45.5,
  status: "GROWING",
  videoCount: 234,
  contentAngles: ["Acheter de l'or", "Meilleurs ETFs"],
}

describe("TrendCard", () => {
  it("renders trend title", () => {
    render(<TrendCard trend={baseTrend} />)
    expect(screen.getByText("Investir dans l'or")).toBeInTheDocument()
  })

  it("displays score", () => {
    render(<TrendCard trend={baseTrend} />)
    expect(screen.getByText("85")).toBeInTheDocument()
  })

  it("shows hot styling for high score (>=75)", () => {
    const { container } = render(<TrendCard trend={baseTrend} />)
    const card = container.querySelector('[class*="border-yt-red"]')
    expect(card).toBeInTheDocument()
  })

  it("shows red background for high score badge", () => {
    render(<TrendCard trend={baseTrend} />)
    const scoreBadge = screen.getByText("85")
    expect(scoreBadge.className).toContain("bg-yt-red")
  })

  it("shows amber for mid score (50-74)", () => {
    const { container } = render(<TrendCard trend={{ ...baseTrend, score: 60 }} />)
    const scoreBadge = screen.getByText("60")
    expect(scoreBadge.className).toContain("bg-amber-500")
  })

  it("shows green for low score (<50)", () => {
    render(<TrendCard trend={{ ...baseTrend, score: 30 }} />)
    const scoreBadge = screen.getByText("30")
    expect(scoreBadge.className).toContain("bg-green-500")
  })

  it("displays velocity percentage", () => {
    render(<TrendCard trend={baseTrend} />)
    expect(screen.getByText(/45\.5%/)).toBeInTheDocument()
  })

  it("displays video count", () => {
    render(<TrendCard trend={baseTrend} />)
    expect(screen.getByText(/234/)).toBeInTheDocument()
    expect(screen.getByText(/vidéos/)).toBeInTheDocument()
  })

  it("displays content angles", () => {
    render(<TrendCard trend={baseTrend} />)
    expect(screen.getByText("Acheter de l'or")).toBeInTheDocument()
    expect(screen.getByText("Meilleurs ETFs")).toBeInTheDocument()
  })

  it("displays status badge", () => {
    render(<TrendCard trend={baseTrend} />)
    expect(screen.getByText("GROWING")).toBeInTheDocument()
  })

  it("handles missing optional fields", () => {
    const minimal = {
      id: "2",
      title: "Minimal trend",
      score: 50,
      velocity: 12.3,
      status: "EMERGING",
      videoCount: undefined as unknown as number,
      contentAngles: [] as string[],
    }
    render(<TrendCard trend={minimal} />)
    expect(screen.getByText("Minimal trend")).toBeInTheDocument()
    expect(screen.getByText("EMERGING")).toBeInTheDocument()
  })

  it("does not show hot border for low score", () => {
    const { container } = render(<TrendCard trend={{ ...baseTrend, score: 30 }} />)
    const card = container.querySelector('[class*="border-yt-red"]')
    expect(card).toBeNull()
  })
})
