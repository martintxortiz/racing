import { cn } from "@/lib/utils"

import "./spinner.css"

interface SpinnerProps {
  size?: number
  className?: string
}

const Spinner = ({ size = 16, className }: SpinnerProps) => {
  return (
    <svg
      aria-hidden="true"
      className={cn("ld-circular-dots", className)}
      style={{ "--ld-size": `${size}px` } as React.CSSProperties}
      fill="currentColor"
      role="presentation"
      viewBox="0 0 16 16"
    >
      <circle className="ld-circular-dots-dot" cx="8" cy="1.5" r="1.5" style={{ "--ld-step": 0 } as React.CSSProperties} />
      <circle className="ld-circular-dots-dot" cx="12.5962" cy="3.4038" r="1.5" style={{ "--ld-step": 1 } as React.CSSProperties} />
      <circle className="ld-circular-dots-dot" cx="14.5" cy="8" r="1.5" style={{ "--ld-step": 2 } as React.CSSProperties} />
      <circle className="ld-circular-dots-dot" cx="12.5962" cy="12.5962" r="1.5" style={{ "--ld-step": 3 } as React.CSSProperties} />
      <circle className="ld-circular-dots-dot" cx="8" cy="14.5" r="1.5" style={{ "--ld-step": 4 } as React.CSSProperties} />
      <circle className="ld-circular-dots-dot" cx="3.4038" cy="12.5962" r="1.5" style={{ "--ld-step": 5 } as React.CSSProperties} />
      <circle className="ld-circular-dots-dot" cx="1.5" cy="8" r="1.5" style={{ "--ld-step": 6 } as React.CSSProperties} />
      <circle className="ld-circular-dots-dot" cx="3.4038" cy="3.4038" r="1.5" style={{ "--ld-step": 7 } as React.CSSProperties} />
    </svg>
  )
}

export { Spinner }
