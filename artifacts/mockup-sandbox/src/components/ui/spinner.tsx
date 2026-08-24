import { Loader2Icon } from "lucide-react"
import type { ComponentProps, ComponentType } from "react"

import { cn } from "@/lib/utils"

type SvgProps = ComponentProps<"svg">

// lucide-react is resolved with the workspace's React 19.1 peer while this
// artifact uses React's 19.2 type package. The SVG contract is identical.
const TypedLoader2Icon = Loader2Icon as unknown as ComponentType<SvgProps>

function Spinner({ className, ...props }: SvgProps) {
  return (
    <TypedLoader2Icon
      role="status"
      aria-label="Loading"
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  )
}

export { Spinner }
