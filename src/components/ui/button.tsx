"use client";

import * as React from "react";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
};

export function Button({
  className = "",
  variant = "default",
  size = "md",
  ...props
}: ButtonProps) {
  const variants: Record<string, string> = {
    default: "bg-accent text-black hover:brightness-110",
    secondary: "bg-white/10 text-white hover:bg-white/15",
    ghost: "bg-transparent hover:bg-white/10",
  };
  const sizes: Record<string, string> = {
    sm: "px-3 py-2 text-sm rounded-md",
    md: "px-4 py-2.5 rounded-md",
    lg: "px-5 py-3 rounded-lg",
  };

  return (
    <button
      className={`${variants[variant]} ${sizes[size]} font-medium disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
      {...props}
    />
  );
}

export default Button;

