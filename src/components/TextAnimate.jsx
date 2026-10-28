/* Adapted from Cult UI Text Animate, MIT, Copyright (c) 2023 Jordan-Gilliam.
 * Source: https://www.cult-ui.com/r/text-animate.json
 * Adaptations: keep only fadeInUp, use project CSS, grapheme-safe splitting,
 * one accessible text label, reduced-motion support and wrapping for Chinese.
 * Full license: THIRD_PARTY_NOTICES.md.
 */
import React from "react";
import { motion, useReducedMotion } from "motion/react";
const container = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.035, delayChildren: 0.1 },
  },
};
const child = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};
export function TextAnimate({ text, className = "" }) {
  const reduced = useReducedMotion();
  const letters =
    typeof Intl.Segmenter === "function"
      ? [
          ...new Intl.Segmenter("zh", { granularity: "grapheme" }).segment(
            text,
          ),
        ].map((x) => x.segment)
      : Array.from(text);
  if (reduced) return <h2 className={className}>{text}</h2>;
  return (
    <motion.h2
      className={"cult-text-animate " + className}
      aria-label={text}
      initial="hidden"
      animate="visible"
      variants={container}
    >
      {letters.map((letter, index) => (
        <motion.span aria-hidden="true" key={index} variants={child}>
          {letter === " " ? "\u00a0" : letter}
        </motion.span>
      ))}
    </motion.h2>
  );
}
