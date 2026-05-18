import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react"
import { CopyButton } from "@/components/dashboard/copy-button"

// Mock clipboard API
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn().mockResolvedValue(undefined),
  },
})

describe("CopyButton", () => {
  it("renders copy button text", () => {
    render(<CopyButton value="test value" />)
    expect(screen.getByRole("button")).toBeInTheDocument()
    expect(screen.getByText("Copier")).toBeInTheDocument()
  })

  it("copies value to clipboard on click", async () => {
    render(<CopyButton value="hello world" />)
    const button = screen.getByRole("button")
    fireEvent.click(button)
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("hello world")
  })

  it("shows 'Copié' after copy", async () => {
    render(<CopyButton value="test" />)
    const button = screen.getByRole("button")
    fireEvent.click(button)
    await waitFor(() => {
      expect(screen.getByText("Copié")).toBeInTheDocument()
    })
  })

  it("reverts to 'Copier' after timeout", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<CopyButton value="test" />)
    const button = screen.getByRole("button")

    await act(async () => {
      fireEvent.click(button)
    })

    expect(screen.getByText("Copié")).toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(2500)
    })

    expect(screen.getByText("Copier")).toBeInTheDocument()
    vi.useRealTimers()
  })
})
