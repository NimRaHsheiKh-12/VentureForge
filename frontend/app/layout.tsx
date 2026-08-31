import type { Metadata } from "next";
import "./globals.css";
import { AdvisorProvider } from "./advisor";
import { LanguageProvider } from "./i18n";

export const metadata: Metadata = {
  title: "VentureForge | Smarter business decisions",
  description: "AI-powered market research and business viability analysis.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en"><body><LanguageProvider><AdvisorProvider>{children}</AdvisorProvider></LanguageProvider></body></html>
  );
}
