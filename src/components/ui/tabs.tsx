"use client";

import * as React from "react";

type TabsContextValue = {
  value: string;
  setValue: (v: string) => void;
};

const TabsCtx = React.createContext<TabsContextValue | null>(null);

type TabsProps = {
  defaultValue?: string;
  value?: string;
  onValueChange?: (v: string) => void;
  children: React.ReactNode;
  className?: string;
};

export function Tabs({ defaultValue, value, onValueChange, children, className = "" }: TabsProps) {
  const [internal, setInternal] = React.useState<string>(defaultValue ?? "");
  const isControlled = value !== undefined;
  const current = isControlled ? (value as string) : internal;
  const setValue = (v: string) => {
    if (!isControlled) setInternal(v);
    onValueChange?.(v);
  };
  const ctx: TabsContextValue = { value: current, setValue };
  return <div className={className}><TabsCtx.Provider value={ctx}>{children}</TabsCtx.Provider></div>;
}

export function TabsList({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={`inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/5 p-1 ${className}`}>
      {children}
    </div>
  );
}

export function TabsTrigger({ value, children, className = "", ...rest }: { value: string; children: React.ReactNode; className?: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const ctx = React.useContext(TabsCtx);
  if (!ctx) return null;
  const active = ctx.value === value;
  return (
    <button
      type="button"
      onClick={() => ctx.setValue(value)}
      data-state={active ? "active" : "inactive"}
      className={`px-3 py-1.5 rounded text-sm transition-colors ${
        active ? "bg-accent text-black shadow-[0_0_12px_rgba(255,255,255,0.25)]" : "text-foreground/80 hover:bg-white/10"
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function TabsContent({ value, children, className = "" }: { value: string; children: React.ReactNode; className?: string }) {
  const ctx = React.useContext(TabsCtx);
  if (!ctx || ctx.value !== value) return null;
  return <div className={className}>{children}</div>;
}

export default Tabs;
