import { useState, useEffect } from "react";

// Tailwind default breakpoints
const breakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
};

type Breakpoint = keyof typeof breakpoints;

/**
 * check if the current window matches the specified breakpoint
 * @param breakpoint the breakpoint to check ('sm' | 'md' | 'lg' | 'xl' | '2xl')
 * @returns true if the current window width is greater than or equal to the specified breakpoint
 */
export function useBreakpoint(breakpoint: Breakpoint): boolean {
  const [isAboveBreakpoint, setIsAboveBreakpoint] = useState<boolean>(false);

  useEffect(() => {
    // check the initial state
    const checkBreakpoint = () => {
      setIsAboveBreakpoint(window.innerWidth >= breakpoints[breakpoint]);
    };

    // check the initial state
    checkBreakpoint();

    // add the resize event listener
    window.addEventListener("resize", checkBreakpoint);

    // clean up the function
    return () => {
      window.removeEventListener("resize", checkBreakpoint);
    };
  }, [breakpoint]);

  return isAboveBreakpoint;
}

/**
 * get the active breakpoints
 * @returns an object containing the active breakpoints and their status
 */
export function useBreakpoints(): Record<Breakpoint, boolean> {
  const [activeBreakpoints, setActiveBreakpoints] = useState<
    Record<Breakpoint, boolean>
  >({
    sm: false,
    md: false,
    lg: false,
    xl: false,
    "2xl": false,
  });

  useEffect(() => {
    const checkBreakpoints = () => {
      const width = window.innerWidth;
      setActiveBreakpoints({
        sm: width >= breakpoints.sm,
        md: width >= breakpoints.md,
        lg: width >= breakpoints.lg,
        xl: width >= breakpoints.xl,
        "2xl": width >= breakpoints["2xl"],
      });
    };

    // check the initial state
    checkBreakpoints();

    // add the resize event listener
    window.addEventListener("resize", checkBreakpoints);

    // clean up the function
    return () => {
      window.removeEventListener("resize", checkBreakpoints);
    };
  }, []);

  return activeBreakpoints;
}
