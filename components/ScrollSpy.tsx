"use client";

import { useEffect, useState } from "react";

// Jump links to sections on the page; the one currently in view is highlighted.
export default function ScrollSpy({ items, variant }: { items: { id: string; label: string }[]; variant: "side" | "tabs" }) {
  const [current, setCurrent] = useState(items[0]?.id ?? "");

  useEffect(() => {
    const onScroll = () => {
      let id = items[0]?.id ?? "";
      for (const it of items) {
        const el = document.getElementById(it.id);
        if (el && el.getBoundingClientRect().top <= 140) id = it.id;
      }
      setCurrent(id);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [items]);

  // Keep the highlighted tab visible in the horizontal bar on phones.
  useEffect(() => {
    if (variant !== "tabs") return;
    const align = () => {
      const el = document.querySelector<HTMLElement>(`.rtabs a[href="#${current}"]`);
      const bar = el?.parentElement;
      if (el && bar) bar.scrollLeft += el.getBoundingClientRect().left - bar.getBoundingClientRect().left - 16;
    };
    align();
    // Again once the page has settled (jumping to #account on load scrolls after hydration).
    const t = window.setTimeout(align, 400);
    return () => window.clearTimeout(t);
  }, [current, variant]);

  return (
    <div className={variant === "side" ? "subnav" : "rtabs no-print"}>
      {items.map((it) => (
        <a key={it.id} href={`#${it.id}`} className={`${variant === "side" ? "navlink sub" : "rtab"}${current === it.id ? " active" : ""}`}>
          {it.label}
        </a>
      ))}
    </div>
  );
}
