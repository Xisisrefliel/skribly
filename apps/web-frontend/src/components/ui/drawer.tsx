import * as React from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "./button"

interface DrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
  side?: "left" | "right"
  title?: string
  className?: string
}

export function Drawer({
  open,
  onOpenChange,
  children,
  side = "left",
  title,
  className,
}: DrawerProps) {
  // Close on escape key
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        onOpenChange(false)
      }
    }
    document.addEventListener("keydown", handleEscape)
    return () => document.removeEventListener("keydown", handleEscape)
  }, [open, onOpenChange])

  // Prevent body scroll when drawer is open
  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [open])

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-background/60 backdrop-blur-sm transition-opacity duration-300",
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        className={cn(
          "fixed top-0 bottom-0 z-50 w-72 max-w-[85vw] transition-transform duration-300 ease-out",
          side === "left" ? "left-0" : "right-0",
          side === "left"
            ? open ? "translate-x-0" : "-translate-x-full"
            : open ? "translate-x-0" : "translate-x-full",
          className
        )}
        role="dialog"
        aria-modal="true"
        aria-label={title || "Navigation drawer"}
      >
        <div className="h-full flex flex-col neu-drawer-panel">
          {/* Header */}
          {title && (
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
              <h2 className="text-sm font-semibold text-foreground">{title}</h2>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onOpenChange(false)}
                className="h-7 w-7 rounded-full neu-button-subtle"
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </Button>
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto scrollbar-hide">
            {children}
          </div>
        </div>
      </div>
    </>
  )
}
