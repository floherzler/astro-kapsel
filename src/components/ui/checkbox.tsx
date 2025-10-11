"use client";

import * as React from "react";

type CheckboxProps = {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  label?: string;
  className?: string;
};

export function Checkbox({ checked, onCheckedChange, label, className = "" }: CheckboxProps) {
  return (
    <label className={`inline-flex items-center gap-2 cursor-pointer select-none ${className}`}>
      <input
        type="checkbox"
        className="peer size-4 rounded border border-white/30 bg-black/30 checked:bg-accent checked:border-accent focus-visible:outline-none"
        checked={!!checked}
        onChange={(e) => onCheckedChange?.(e.target.checked)}
      />
      {label && <span className="text-sm text-foreground/80">{label}</span>}
    </label>
  );
}

export default Checkbox;

