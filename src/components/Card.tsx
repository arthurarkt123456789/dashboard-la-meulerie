import type { ReactNode } from "react";

type Props = {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  padding?: boolean;
  span?: number;
};

export function Card({
  title,
  subtitle,
  action,
  children,
  padding = true,
  span,
}: Props) {
  return (
    <div
      className="lm-card"
      data-span={span}
      style={span ? { gridColumn: `span ${span}` } : undefined}
    >
      {(title || action) && (
        <div className="lm-card-head">
          <div>
            {title && <h3 className="lm-card-title">{title}</h3>}
            {subtitle && <div className="lm-card-subtitle">{subtitle}</div>}
          </div>
          {action && <div className="lm-card-action">{action}</div>}
        </div>
      )}
      <div className={"lm-card-body " + (padding ? "padded" : "")}>{children}</div>
    </div>
  );
}
