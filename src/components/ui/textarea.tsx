"use client";

import * as React from "react";

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className = "", ...props }, ref) => (
    <textarea
      ref={ref}
      className={`min-h-[4.5rem] w-full resize-none rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-foreground/90 outline-none transition focus:border-accent/60 focus:ring-1 focus:ring-accent/40 ${className}`}
      {...props}
    />
  )
);

Textarea.displayName = "Textarea";

export default Textarea;
