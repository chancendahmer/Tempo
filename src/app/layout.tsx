import type { Metadata, Viewport } from "next";
import "@fontsource-variable/manrope";
import "flag-icons/css/flag-icons.min.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tempo — The AI that pays attention",
  description:
    "Keep your tasks, routines and reminders together. Plan by text or in your Tempo dashboard.",
  icons: {
    icon: "/images/tempo-avatar.png",
    apple: "/images/tempo-icon-180.png",
  },
  applicationName: "Tempo",
  appleWebApp: { capable: true, title: "Tempo", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#354f42" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
