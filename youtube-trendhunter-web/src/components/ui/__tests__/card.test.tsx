import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"

describe("Card", () => {
  it("renders card component", () => {
    render(<Card>Card Content</Card>)
    expect(document.querySelector(".border-hairline-dark")).toBeInTheDocument()
  })

  it("applies custom className", () => {
    render(<Card className="custom-class">Content</Card>)
    expect(document.querySelector(".custom-class")).toBeInTheDocument()
  })
})

describe("CardHeader", () => {
  it("renders card header with flex layout", () => {
    render(<CardHeader>Header Content</CardHeader>)
    expect(document.querySelector(".flex.flex-col")).toBeInTheDocument()
  })

  it("applies custom className", () => {
    render(<CardHeader className="custom-header">Content</CardHeader>)
    expect(document.querySelector(".custom-header")).toBeInTheDocument()
  })
})

describe("CardTitle", () => {
  it("renders h3 element", () => {
    render(<CardTitle>Title</CardTitle>)
    expect(screen.getByRole("heading", { level: 3 })).toBeInTheDocument()
  })

  it("displays title text", () => {
    render(<CardTitle>My Title</CardTitle>)
    expect(screen.getByText("My Title")).toBeInTheDocument()
  })

  it("applies custom className", () => {
    render(<CardTitle className="custom-title">Title</CardTitle>)
    expect(screen.getByRole("heading", { level: 3 })).toHaveClass("custom-title")
  })
})

describe("CardDescription", () => {
  it("renders paragraph element", () => {
    render(<CardDescription>Description text</CardDescription>)
    const el = document.querySelector(".text-dark-ink-secondary")
    expect(el).toBeInTheDocument()
  })

  it("displays description text", () => {
    render(<CardDescription>A nice description</CardDescription>)
    expect(screen.getByText("A nice description")).toBeInTheDocument()
  })
})

describe("CardContent", () => {
  it("renders content with padding", () => {
    render(<CardContent>Content</CardContent>)
    expect(document.querySelector(".p-6")).toBeInTheDocument()
    expect(document.querySelector(".pt-0")).toBeInTheDocument()
  })

  it("applies custom className", () => {
    render(<CardContent className="custom-content">Content</CardContent>)
    expect(document.querySelector(".custom-content")).toBeInTheDocument()
  })
})

describe("CardFooter", () => {
  it("renders footer with flex and items-center", () => {
    render(<CardFooter>Footer</CardFooter>)
    expect(document.querySelector(".flex.items-center")).toBeInTheDocument()
  })

  it("applies custom className", () => {
    render(<CardFooter className="custom-footer">Footer</CardFooter>)
    expect(document.querySelector(".custom-footer")).toBeInTheDocument()
  })
})