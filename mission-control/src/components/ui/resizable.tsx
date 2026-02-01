"use client"

import * as React from "react"
import { GripVerticalIcon, GripHorizontalIcon } from "lucide-react"
import * as ResizablePrimitive from "react-resizable-panels"

import { cn } from "@/lib/utils"

function ResizablePanelGroup({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Group>) {
  return (
    <ResizablePrimitive.Group
      data-slot="resizable-panel-group"
      orientation={orientation}
      className={cn(
        "flex h-full w-full",
        orientation === "vertical" && "flex-col",
        className
      )}
      {...props}
    />
  )
}

function ResizablePanel({
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Panel>) {
  return <ResizablePrimitive.Panel data-slot="resizable-panel" {...props} />
}

function ResizableHandle({
  withHandle,
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Separator> & {
  withHandle?: boolean
  orientation?: "horizontal" | "vertical"
}) {
  const isVertical = orientation === "vertical"
  
  return (
    <ResizablePrimitive.Separator
      data-slot="resizable-handle"
      className={cn(
        "bg-border focus-visible:ring-ring relative flex items-center justify-center focus-visible:ring-1 focus-visible:ring-offset-1 focus-visible:outline-hidden",
        // Horizontal group: vertical separator (thin width, full height)
        !isVertical && "w-px after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2",
        // Vertical group: horizontal separator (full width, thin height)
        isVertical && "h-px w-full after:absolute after:inset-x-0 after:top-1/2 after:h-1 after:w-full after:-translate-y-1/2",
        className
      )}
      {...props}
    >
      {withHandle && (
        <div className={cn(
          "bg-border z-10 flex items-center justify-center rounded-xs border",
          isVertical ? "h-3 w-4" : "h-4 w-3"
        )}>
          {isVertical ? (
            <GripHorizontalIcon className="size-2.5" />
          ) : (
            <GripVerticalIcon className="size-2.5" />
          )}
        </div>
      )}
    </ResizablePrimitive.Separator>
  )
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }
