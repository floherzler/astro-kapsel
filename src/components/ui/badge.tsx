"use client";

import * as React from "react";

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: "default" | "secondary";
};

export function Badge({ className = "", variant = "default", ...props }: BadgeProps) {
  const styles = {
    default: "bg-accent/90 text-black border border-accent/60",
    secondary: "bg-white/10 text-white border border-white/20",
  } as const;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium shadow-sm backdrop-blur-sm ${styles[variant]} ${className}`}
      {...props}
    />
  );
}

export default Badge;

