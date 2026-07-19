import { useEffect, useRef, useState } from "react";
import { animate, motion, useReducedMotion } from "framer-motion";

/**
 * Rolls a numeric KPI from its previous value to `value` — from 0 on first mount, and
 * from the old figure when a Scope/Basis/Scenario switch lands new data. Honours
 * prefers-reduced-motion by rendering the final value immediately.
 */
export function CountUp({ value, format, duration = 0.9 }: {
  value: number; format?: (v: number) => string; duration?: number;
}) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(() => (reduce ? value : 0));
  const from = useRef(reduce ? value : 0);
  useEffect(() => {
    if (reduce) { from.current = value; setShown(value); return; }
    const ctl = animate(from.current, value, { duration, ease: [0.22, 1, 0.36, 1], onUpdate: setShown });
    from.current = value;
    return () => ctl.stop();
  }, [value, reduce, duration]);
  return <>{format ? format(shown) : Math.round(shown).toLocaleString()}</>;
}

/** Fade-and-rise entrance, staggered by index `i`. Runs once per mount. */
export function Reveal({ i = 0, className, children }: {
  i?: number; className?: string; children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: i * 0.06, ease: "easeOut" }}>
      {children}
    </motion.div>
  );
}
