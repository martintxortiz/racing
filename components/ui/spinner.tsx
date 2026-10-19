import { cn } from "@/lib/utils";

import "./spinner.css";

interface SpinnerProps {
  size?: number;
  className?: string;
}

const DOTS: Array<[cx: number, cy: number]> = [
  [8, 1.5],
  [12.5962, 3.4038],
  [14.5, 8],
  [12.5962, 12.5962],
  [8, 14.5],
  [3.4038, 12.5962],
  [1.5, 8],
  [3.4038, 3.4038],
];

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
      {DOTS.map(([cx, cy], step) => (
        <circle
          key={step}
          className="ld-circular-dots-dot"
          cx={cx}
          cy={cy}
          r="1.5"
          style={{ "--ld-step": step } as React.CSSProperties}
        />
      ))}
    </svg>
  );
};

export { Spinner };
