"use client";

import * as React from "react";

type ToggleGroupContext = {
  type: "single" | "multiple";
  value: string[];
  setValue: (next: string[]) => void;
};

const Ctx = React.createContext<ToggleGroupContext | null>(null);

type ToggleGroupProps = {
  type?: "single" | "multiple";
  value: string[] | string;
  onValueChange: (next: string[] | string) => void;
  className?: string;
  children: React.ReactNode;
};

export function ToggleGroup({ type = "multiple", value, onValueChange, className = "", children }: ToggleGroupProps) {
  const normalized = Array.isArray(value) ? value : value ? [value] : [];
  const setValue = (next: string[]) => {
    if (type === "single") onValueChange(next[0] ?? "");
    else onValueChange(next);
  };
  return (
    <div className={`inline-flex flex-wrap gap-2 ${className}`}>
      <Ctx.Provider value={{ type, value: normalized, setValue }}>{children}</Ctx.Provider>
    </div>
  );
}

type ToggleGroupItemProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  value: string;
};

export function ToggleGroupItem({ value, className = "", children, ...rest }: ToggleGroupItemProps) {
  const ctx = React.useContext(Ctx);
  const pressed = !!ctx?.value.includes(value);

  const toggle = () => {
    if (!ctx) return;
    if (ctx.type === "single") {
      ctx.setValue(pressed ? [] : [value]);
      return;
    }
    if (pressed) ctx.setValue(ctx.value.filter((v) => v !== value));
    else ctx.setValue([...ctx.value, value]);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className={`px-3 py-1.5 rounded text-sm transition-colors border ${
        pressed
          ? "bg-accent/20 text-accent border-accent/50 shadow-[0_0_10px_rgba(255,255,255,0.2)]"
          : "text-foreground/80 hover:bg-white/10 border-white/15"
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export default ToggleGroup;

