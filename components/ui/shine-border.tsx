import type { CSSProperties, ReactNode } from "react";

type ShineBorderProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

/**
 * Adapted from Spell UI's ShineBorder pattern (MIT):
 * https://github.com/xxtomm/spell-ui
 */
export function ShineBorder({ children, className, style }: ShineBorderProps) {
  return (
    <div className={`spell-shine-border ${className ?? ""}`} style={style}>
      <div className="spell-shine-border__content">{children}</div>
    </div>
  );
}
