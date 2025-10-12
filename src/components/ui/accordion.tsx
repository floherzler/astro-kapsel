"use client";

import * as React from "react";

type AccordionProps = React.HTMLAttributes<HTMLDivElement> & {
  children: React.ReactNode;
};

export function Accordion({ children, className = "", ...rest }: AccordionProps) {
  return (
    <div className={`space-y-2 ${className}`} {...rest}>
      {children}
    </div>
  );
}

type AccordionItemProps = {
  header: React.ReactNode | ((open: boolean) => React.ReactNode);
  children: React.ReactNode;
  className?: string;
  defaultOpen?: boolean;
};

export function AccordionItem({ header, children, className = "", defaultOpen = false }: AccordionItemProps) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className={`rounded-md overflow-hidden ${className}`}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left cursor-pointer"
      >
        {typeof header === "function" ? (header as (open: boolean) => React.ReactNode)(open) : header}
      </button>
      <div
        className={`transition-[max-height,opacity] duration-300 ease-out ${open ? "max-h-64 opacity-100" : "max-h-0 opacity-0"}`}
      >
        <div className="px-4 pb-4 pt-2 bg-black/20 border-t border-white/10">
          {children}
        </div>
      </div>
    </div>
  );
}

export default Accordion;
