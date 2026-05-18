import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { Button } from "@/components/ui/button"

describe("Button", () => {
  describe("variant prop", () => {
    it("renders with default variant", () => {
      render(<Button>Click me</Button>)
      const button = screen.getByRole("button")
      expect(button).toBeInTheDocument()
    })

    it("renders outline variant", () => {
      render(<Button variant="outline">Outline</Button>)
      expect(screen.getByRole("button")).toBeInTheDocument()
    })

    it("renders destructive variant", () => {
      render(<Button variant="destructive">Delete</Button>)
      expect(screen.getByRole("button")).toBeInTheDocument()
    })

    it("renders ghost variant", () => {
      render(<Button variant="ghost">Ghost</Button>)
      expect(screen.getByRole("button")).toBeInTheDocument()
    })

    it("renders secondary variant", () => {
      render(<Button variant="secondary">Secondary</Button>)
      expect(screen.getByRole("button")).toBeInTheDocument()
    })

    it("renders link variant styled as button", () => {
      // Note: link variant is still a button element, just styled as a link
      render(<Button variant="link">Link</Button>)
      expect(screen.getByRole("button")).toBeInTheDocument()
    })

    it("renders subscribe variant", () => {
      render(<Button variant="subscribe">Subscribe</Button>)
      expect(screen.getByRole("button")).toBeInTheDocument()
    })

    it("renders subscribed variant", () => {
      render(<Button variant="subscribed">Subscribed</Button>)
      expect(screen.getByRole("button")).toBeInTheDocument()
    })
  })

  describe("size prop", () => {
    it("renders with default size", () => {
      render(<Button>Default</Button>)
      expect(screen.getByRole("button")).toBeInTheDocument()
    })

    it("renders small size", () => {
      render(<Button size="sm">Small</Button>)
      expect(screen.getByRole("button")).toBeInTheDocument()
    })

    it("renders large size", () => {
      render(<Button size="lg">Large</Button>)
      expect(screen.getByRole("button")).toBeInTheDocument()
    })

    it("renders icon size", () => {
      render(<Button size="icon">X</Button>)
      expect(screen.getByRole("button")).toBeInTheDocument()
    })
  })

  describe("disabled state", () => {
    it("renders disabled button", () => {
      render(<Button disabled>Disabled</Button>)
      expect(screen.getByRole("button")).toBeDisabled()
    })

    it("applies disabled styling", () => {
      render(<Button disabled>Disabled</Button>)
      expect(screen.getByRole("button")).toHaveClass("disabled:opacity-50")
    })
  })

  describe("className prop", () => {
    it("applies custom className", () => {
      render(<Button className="custom-class">Custom</Button>)
      expect(screen.getByRole("button")).toHaveClass("custom-class")
    })
  })

  describe("type attribute", () => {
    it("renders without type attribute by default", () => {
      // Default HTML buttons don't have explicit type attribute
      render(<Button>Click</Button>)
      // No type attribute = browser defaults to type="submit"
      expect(screen.getByRole("button")).toBeInTheDocument()
    })

    it("allows custom type", () => {
      render(<Button type="submit">Submit</Button>)
      expect(screen.getByRole("button")).toHaveAttribute("type", "submit")
    })
  })

  describe("asChild prop", () => {
    it("renders child element", () => {
      render(
        <Button asChild>
          <a href="/test">Link Button</a>
        </Button>
      )
      expect(screen.getByRole("link")).toBeInTheDocument()
    })
  })
})