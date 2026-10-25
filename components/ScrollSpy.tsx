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
    const el = document.querySelector<HTMLElement>(`.rtabs a[href="#${current}"]`);
    const bar = el?.parentElement;
    if (el && bar) bar.scrollTo({ left: el.offsetLeft - 16, behavior: "smooth" });
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
