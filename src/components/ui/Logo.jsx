"use client";
import { C } from "@/lib/theme";

export const Logo = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
    <svg width="34" height="34" viewBox="0 0 34 34" fill="none">
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="34" y2="34">
          <stop stopColor="#22C55E" />
          <stop offset="1" stopColor="#15803d" />
        </linearGradient>
      </defs>
      <rect width="34" height="34" rx="9" fill="url(#lg)" />
      <ellipse cx="17" cy="17" rx="10" ry="6.5" stroke="white" strokeWidth="1.8" fill="none" />
      <line x1="17" y1="10.5" x2="17" y2="23.5" stroke="white" strokeWidth="1.5" />
      <line x1="12" y1="14" x2="22" y2="14" stroke="white" strokeWidth="1.1" opacity="0.9" />
      <line x1="11" y1="17" x2="23" y2="17" stroke="white" strokeWidth="1.1" opacity="0.9" />
      <line x1="12" y1="20" x2="22" y2="20" stroke="white" strokeWidth="1.1" opacity="0.9" />
    </svg>
    <div style={{ lineHeight: 1.1 }}>
      <div style={{ fontWeight: 900, fontSize: 14, color: C.text, letterSpacing: -0.3 }}>
        GRIDIRON<span style={{ color: C.accent }}>IQ</span>
      </div>
      <div style={{ fontSize: 8.5, color: C.muted, letterSpacing: 2.5, fontFamily: "monospace", marginTop: 1 }}>
        FANTASY INTEL
      </div>
    </div>
  </div>
);
