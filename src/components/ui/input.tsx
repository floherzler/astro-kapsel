"use client";

import * as React from "react";

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", ...props }, ref) => (
    <input
      ref={ref}
      className={`flex-1 rounded-md bg-black/30 border border-white/15 px-4 py-3 outline-none focus:ring-2 focus:ring-accent/60 ${className}`}
      {...props}
    />
  )
);
Input.displayName = "Input";

export default Input;

