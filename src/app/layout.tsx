import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "UJV Atlas — Knowledge Spine Validation",
  description: "Thin operational slice demonstrating structured query to grounded, citation-backed output.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
