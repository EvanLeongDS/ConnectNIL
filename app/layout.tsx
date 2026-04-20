import type { Metadata } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import ThemeDebugProbe from "@/components/ThemeDebugProbe";

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
        {/* Prevent flash of wrong theme on load */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'){document.documentElement.classList.add('dark');}else{document.documentElement.classList.remove('dark');if(!t){localStorage.setItem('theme','light');}}}catch(e){}})()`,
          }}
        />
      </head>
      <body className="min-h-screen bg-white text-black antialiased dark:bg-[#0d1117] dark:text-white">
        <ThemeDebugProbe label="RootLayout" />
        {children}
      </body>
    </html>
  );
}
