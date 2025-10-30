"use client";

import * as React from "react";

type Item = { value: string; label: string };

type DropdownProps = {
  value: string;
  onChange: (v: string) => void;
  items: Item[];
  className?: string;
};

export function Dropdown({ value, onChange, items, className = "" }: DropdownProps) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement | null>(null);
  const selected = items.find((i) => i.value === value)?.label ?? value;

  React.useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex w-full items-center justify-between gap-2 rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10"
      >
        <span>{selected}</span>
        <span aria-hidden className={`transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      {open && (
        <div className="absolute left-1/2 z-30 mt-1 w-full min-w-full -translate-x-1/2 transform overflow-hidden rounded-md border border-white/15 bg-[#0b1020] shadow-lg">
          {items.map((it) => (
            <button
              key={it.value}
              type="button"
              onClick={() => {
                onChange(it.value);
                setOpen(false);
              }}
              className={`block w-full px-3 py-2 text-left text-sm hover:bg-white/10 ${
                it.value === value ? "bg-white/10" : ""
              }`}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default Dropdown;
