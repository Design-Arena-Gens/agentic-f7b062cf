import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aesthetic Video Generator",
  description: "Render and download an aesthetic generative video clip.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
