import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "XOR Bomb Defusal Workshop",
  description: "เกมจำลองการกู้ระเบิดด้วยรหัส XOR สำหรับ Workshop",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=VT323&display=swap" rel="stylesheet" />
      </head>
      <body className="bg-zinc-950 text-green-400 font-mono select-none antialiased">
        {children}
      </body>
    </html>
  );
}