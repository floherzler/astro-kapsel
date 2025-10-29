"use client";

import {
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type ReactElement,
  type HTMLAttributes,
} from "react";

function cx(...parts: Array<string | undefined | null | false>) {
  return parts.filter(Boolean).join(" ");
}

type TooltipTimers = {
  open?: ReturnType<typeof setTimeout>;
  close?: ReturnType<typeof setTimeout>;
};

type TooltipContextValue = {
  open: boolean;
  openImmediate: () => void;
  openWithDelay: () => void;
  closeWithDelay: () => void;
  id: string;
};

const TooltipContext = createContext<TooltipContextValue | null>(null);

function useTooltipContext(component: string) {
  const ctx = useContext(TooltipContext);
  if (!ctx) throw new Error(`<${component}> must be used within a <Tooltip>`);
  return ctx;
}

type TooltipProps = {
  children: ReactNode;
  openDelay?: number;
  closeDelay?: number;
  className?: string;
};

export function Tooltip({
  children,
  openDelay = 80,
  closeDelay = 60,
  className = "",
}: TooltipProps) {
  const [open, setOpen] = useState(false);
  const timers = useRef<TooltipTimers>({});
  const id = useId();

  useEffect(() => {
    const timersRef = timers.current;
    return () => {
      if (timersRef.open) clearTimeout(timersRef.open);
      if (timersRef.close) clearTimeout(timersRef.close);
    };
  }, []);

  const value = useMemo<TooltipContextValue>(() => {
    const clearTimers = () => {
      if (timers.current.open) {
        clearTimeout(timers.current.open);
        timers.current.open = undefined;
      }
      if (timers.current.close) {
        clearTimeout(timers.current.close);
        timers.current.close = undefined;
      }
    };
    const openImmediate = () => {
      clearTimers();
      setOpen(true);
    };
    const openWithDelay = () => {
      clearTimers();
      timers.current.open = setTimeout(() => setOpen(true), openDelay);
    };
    const closeWithDelay = () => {
      clearTimers();
      timers.current.close = setTimeout(() => setOpen(false), closeDelay);
    };
    return { open, openImmediate, openWithDelay, closeWithDelay, id };
  }, [open, openDelay, closeDelay, id]);

  return (
    <TooltipContext.Provider value={value}>
      <span className={cx("relative inline-flex", className)}>{children}</span>
    </TooltipContext.Provider>
  );
}

type TooltipTriggerProps = {
  children: ReactNode;
  className?: string;
  asChild?: boolean;
};

export function TooltipTrigger({ children, className = "", asChild = false }: TooltipTriggerProps) {
  const { open, openImmediate, openWithDelay, closeWithDelay, id } = useTooltipContext("TooltipTrigger");

  const triggerProps = {
    onMouseEnter: openWithDelay,
    onMouseLeave: closeWithDelay,
    onFocus: openImmediate,
    onBlur: closeWithDelay,
    onTouchStart: openImmediate,
    onTouchEnd: closeWithDelay,
    "aria-describedby": open ? id : undefined,
  };

  if (asChild && isValidElement(children)) {
    const child = children as ReactElement<{ className?: string; tabIndex?: number }>;
    return cloneElement(child, {
      ...triggerProps,
      className: cx(child.props.className, className),
      tabIndex: child.props.tabIndex ?? 0,
    } as HTMLAttributes<HTMLElement>);
  }

  return (
    <button
      type="button"
      className={cx(
        "inline-flex cursor-default items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/80",
        className
      )}
      {...triggerProps}
    >
      {children}
    </button>
  );
}

type TooltipContentProps = {
  children: ReactNode;
  className?: string;
  align?: "start" | "center" | "end";
  sideOffset?: number;
};

export function TooltipContent({
  children,
  className = "",
  align = "center",
  sideOffset = 8,
}: TooltipContentProps) {
  const { open, openImmediate, closeWithDelay, id } = useTooltipContext("TooltipContent");
  if (!open) return null;

  const alignmentClass =
    align === "start" ? "left-0" : align === "end" ? "right-0" : "left-1/2 -translate-x-1/2";

  return (
    <div
      role="tooltip"
      id={id}
      onMouseEnter={openImmediate}
      onMouseLeave={closeWithDelay}
      className={cx(
        "pointer-events-none absolute z-50 max-w-[16rem] rounded-md border border-white/10 bg-slate-950/95 px-3 py-2 text-xs text-slate-200 shadow-lg backdrop-blur",
        alignmentClass,
        className
      )}
      style={{ top: `calc(100% + ${sideOffset}px)` }}
    >
      {children}
    </div>
  );
}

export default Tooltip;
