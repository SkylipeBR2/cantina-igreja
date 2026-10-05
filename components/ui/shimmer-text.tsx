import type { CSSProperties, ReactNode } from "react";

type ShimmerTextProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

/**
 * Adapted from Spell UI's ShimmerText pattern (MIT):
 * https://github.com/xxtomm/spell-ui
 */
export function ShimmerText({ children, className, style }: ShimmerTextProps) {
  return (
    <span className={`spell-shimmer-text ${className ?? ""}`} style={style}>
      {children}
    </span>
  );
}
