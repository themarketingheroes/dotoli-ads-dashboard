"use client";

export default function PrintButton() {
  return (
    <button className="btn" onClick={() => window.print()}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <path d="M4 6V2h8v4M4 12H2.5A.5.5 0 0 1 2 11.5v-5A.5.5 0 0 1 2.5 6h11a.5.5 0 0 1 .5.5v5a.5.5 0 0 1-.5.5H12M4 9.5h8V14H4z" strokeLinejoin="round" />
      </svg>
      Print / save as PDF
    </button>
  );
}
