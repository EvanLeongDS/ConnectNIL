import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Prevent flash of wrong theme on load */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){if(localStorage.getItem('theme')==='dark'){document.documentElement.classList.add('dark')}})()`,
          }}
        />
      </head>
      <body className="min-h-screen bg-white text-black antialiased dark:bg-[#0d1117] dark:text-white">
        {children}
      </body>
    </html>
  );
}
