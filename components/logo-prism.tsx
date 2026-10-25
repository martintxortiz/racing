import type { CSSProperties, SVGProps } from "react";
import { useId } from "react";

import "./logo-prism.css";

const PATH =
  "M 128 28 C 140 112 171 175 236 220 C 160 190 96 190 20 220 C 85 175 116 112 128 28 Z";

// F1 team palette, in the order supplied.
const PRISM_STOPS = [
  "#3671C6",
  "#27F4D2",
  "#E80020",
  "#FF8000",
  "#00665E",
  "#0090FF",
  "#64C4FF",
  "#6692FF",
  "#E6002B",
  "#C00000",
  "#C8102E",
];

// Crystal gloss: lit top-left, a facet glint, then a shaded base for depth.
const FACET_STOPS: { offset: number; light: string; rest?: string }[] = [
  { offset: 0, light: "rgba(255, 255, 255, 0.42)" },
  { offset: 38, light: "rgba(255, 255, 255, 0.05)" },
  { offset: 52, light: "rgba(255, 255, 255, 0.2)" },
  { offset: 58, light: "rgba(255, 255, 255, 0.04)" },
  { offset: 100, light: "rgba(0, 0, 0, 0.32)", rest: "rgba(0, 0, 0, 0)" },
];

export default function PrismLogo({
  className,
  ...props
}: SVGProps<SVGSVGElement>) {
  const id = useId();
  const gradientId = `${id}-gradient`;
  const facetId = `${id}-facet`;
  const clipId = `${id}-clip`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 256 256"
      width="1em"
      height="1em"
      aria-hidden="true"
      className={className ? `logo-prism ${className}` : "logo-prism"}
      {...props}
    >
      <defs>
        <linearGradient
          id={gradientId}
          gradientUnits="userSpaceOnUse"
          x1="20"
          y1="128"
          x2="236"
          y2="128"
        >
          {PRISM_STOPS.map((color, i) => (
            <stop
              key={i}
              className="logo-prism__stop"
              offset={`${(i / (PRISM_STOPS.length - 1)) * 100}%`}
              style={
                {
                  "--prism-stop": color,
                  transitionDelay: `${i * 40}ms`,
                } as CSSProperties
              }
            />
          ))}
        </linearGradient>

        <linearGradient
          id={facetId}
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1="0"
          x2="256"
          y2="256"
        >
          {FACET_STOPS.map((stop, i) => (
            <stop
              key={i}
              className="logo-prism__facet-stop"
              offset={`${stop.offset}%`}
              style={
                {
                  "--facet-stop": stop.light,
                  ...(stop.rest ? { "--facet-rest": stop.rest } : null),
                  transitionDelay: `${i * 55}ms`,
                } as CSSProperties
              }
            />
          ))}
        </linearGradient>

        <clipPath id={clipId}>
          <path d={PATH} />
        </clipPath>
      </defs>

      <g className="logo-prism__scale">
        <g clipPath={`url(#${clipId})`}>
          <rect
            className="logo-prism__color"
            x="0"
            y="0"
            width="256"
            height="256"
            fill={`url(#${gradientId})`}
          />
          <rect
            className="logo-prism__facet"
            x="0"
            y="0"
            width="256"
            height="256"
            fill={`url(#${facetId})`}
          />
          <path
            className="logo-prism__rim"
            d={PATH}
            fill="none"
            strokeWidth="5"
            style={{ transitionDelay: "120ms" }}
          />
        </g>
      </g>
    </svg>
  );
}
