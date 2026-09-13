import type { SVGProps } from "react";

const paths = {
  home: "m3 10 9-7 9 7M5 9v11h5v-6h4v6h5V9",
  network: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  messages: "M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5",
  contracts: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8ZM14 2v6h6M8 13h8M8 17h5",
  earnings: "M3 7h18v14H3ZM3 7V5a2 2 0 0 1 2-2h13v4M16 12h5v5h-5Z",
  close: "m6 6 12 12M6 18 18 6",
  expand: "M14 3h7v7M21 3l-9 9M10 21H3v-7M3 21l9-9",
  chevron: "m6 9 6 6 6-6",
  back: "m12 19-7-7 7-7M5 12h14",
  compose: "M12 20H4V4h8M16 3l5 5-9 9-5 1 1-5Z",
} as const;

export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: keyof typeof paths }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={paths[name]} /></svg>;
}
