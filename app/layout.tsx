import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";

// Sole institutional typeface per DESIGN_SYSTEM §2 (MPGI uses Poppins; decision D-012).
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PratapPass — Digital Gate Pass System | MPGI",
  description:
    "Digital gate pass requests and medical document approvals for Maharana Pratap Group of Institutions, Kanpur.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${poppins.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}
