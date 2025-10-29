"use client";

import {
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
  type ReactElement,
  type HTMLAttributes,
} from "react";

function cx(...parts: Array<string | undefined | null | false>) {
  return parts.filter(Boolean).join(" ");
}

type HoverIntentTimers = {
  open?: ReturnType<typeof setTimeout>;
  close?: ReturnType<typeof setTimeout>;
};

type HoverCardContextValue = {
  open: boolean;
  openImmediate: () => void;
  openWithDelay: () => void;
  closeWithDelay: () => void;
};

const HoverCardContext = createContext<HoverCardContextValue | null>(null);

function useHoverCardContext(component: string) {
  const ctx = useContext(HoverCardContext);
  if (!ctx) {
    throw new Error(`<${component}> must be used within a <HoverCard>`);
  }
  return ctx;
}

type HoverCardProps = {
  children: ReactNode;
  openDelay?: number;
  closeDelay?: number;
  className?: string;
};

export function HoverCard({
  children,
  openDelay = 120,
  closeDelay = 100,
  className = "",
}: HoverCardProps) {
  const [open, setOpen] = useState(false);
  const timers = useRef<HoverIntentTimers>({});

  useEffect(() => {
    const timersRef = timers.current;
    return () => {
      if (timersRef.open) clearTimeout(timersRef.open);
      if (timersRef.close) clearTimeout(timersRef.close);
    };
  }, []);

  const value = useMemo<HoverCardContextValue>(() => {
    const clear = () => {
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
      clear();
      setOpen(true);
    };
    const openWithDelay = () => {
      clear();
      timers.current.open = setTimeout(() => setOpen(true), openDelay);
    };
    const closeWithDelay = () => {
      clear();
      timers.current.close = setTimeout(() => setOpen(false), closeDelay);
    };
    return {
      open,
      openImmediate,
      openWithDelay,
      closeWithDelay,
    };
  }, [open, openDelay, closeDelay]);

  return (
    <HoverCardContext.Provider value={value}>
      <span className={cx("relative inline-flex", className)}>{children}</span>
    </HoverCardContext.Provider>
  );
}

type HoverCardTriggerProps = {
  children: ReactNode;
  className?: string;
  asChild?: boolean;
};

export function HoverCardTrigger({
  children,
  className = "",
  asChild = false,
}: HoverCardTriggerProps) {
  const { open, openImmediate, openWithDelay, closeWithDelay } = useHoverCardContext("HoverCardTrigger");

  const eventProps = {
    onMouseEnter: openWithDelay,
    onMouseLeave: closeWithDelay,
    onFocus: openImmediate,
    onBlur: closeWithDelay,
    onTouchStart: openImmediate,
    onTouchEnd: closeWithDelay,
  };

  if (asChild && isValidElement(children)) {
    const child = children as ReactElement<{ className?: string }>;
    return cloneElement(child, {
      ...eventProps,
      className: cx(child.props.className, className),
      "aria-expanded": open,
      "aria-haspopup": "dialog",
    } as HTMLAttributes<HTMLElement>);
  }

  return (
    <span
      tabIndex={0}
      role="button"
      aria-expanded={open}
      aria-haspopup="dialog"
      className={cx(
        "inline-flex cursor-pointer items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/80",
        className
      )}
      {...eventProps}
    >
      {children}
    </span>
  );
}

type HoverCardContentProps = {
  children: ReactNode;
  className?: string;
  align?: "start" | "center" | "end";
  sideOffset?: number;
  side?: "bottom" | "top" | "center";
};

export function HoverCardContent({
  children,
  className = "",
  align = "center",
  sideOffset = 10,
  side = "bottom",
}: HoverCardContentProps) {
  const { open, openImmediate, closeWithDelay } = useHoverCardContext("HoverCardContent");
  if (!open) return null;

  const alignmentClass =
    align === "start"
      ? "left-0"
      : align === "end"
      ? "right-0"
      : "left-1/2 -translate-x-1/2";

  let sideClass = "";
  const positionStyle: CSSProperties = {};

  if (side === "top") {
    sideClass = "";
    positionStyle.bottom = `calc(100% + ${sideOffset}px)`;
  } else if (side === "center") {
    sideClass = "-translate-y-1/2";
    positionStyle.top = `calc(50% + ${sideOffset}px)`;
  } else {
    positionStyle.top = `calc(100% + ${sideOffset}px)`;
  }

  return (
    <div
      onMouseEnter={openImmediate}
      onMouseLeave={closeWithDelay}
      className={cx(
        "pointer-events-auto absolute z-50 min-w-[14rem] rounded-2xl border border-white/10 bg-slate-950/95 p-4 shadow-xl backdrop-blur",
        alignmentClass,
        sideClass,
        className
      )}
      style={positionStyle}
    >
      {children}
    </div>
  );
}

export default HoverCard;
