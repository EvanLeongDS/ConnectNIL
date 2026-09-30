import type { Metadata } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "ConnectNIL",
  description: "Season-long NIL partnerships made simpler",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={cn("font-sans", geist.variable)}>
      <head>
        {/*
          * Resolve the theme before first paint, so there is no flash of the wrong one.
          *
          * The stored value is tri-state on purpose: 'dark' and 'light' are an explicit
          * choice from the toggle, and ABSENT means "follow the OS". The old version
          * wrote 'light' into localStorage the first time anyone loaded the site, which
          * silently converted "no opinion" into "explicitly light" — so every visitor
          * whose system (or dark-mode extension) is dark got a white app on their first
          * visit and stayed on it forever, because the key was now set. Nothing here
          * writes; only the toggle does.
          */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})()`,
          }}
        />
      </head>
      <body className="min-h-screen bg-white text-black antialiased dark:bg-[#0d1117] dark:text-white">
        {children}
      </body>
    </html>
  );
}
