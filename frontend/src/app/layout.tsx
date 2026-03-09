import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { DataProvider } from "@/context/DataContext";
import { SidebarProvider } from "@/context/SidebarContext";
import { Sidebar } from "@/components/Sidebar";
import { MainContent } from "@/components/MainContent";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PayAnalytics - Financial Dashboard",
  description:
    "Upload and analyze your financial data with interactive charts, reports, and insights.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <ThemeProvider>
          <DataProvider>
            <SidebarProvider>
              <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
                <Sidebar />
                <MainContent>{children}</MainContent>
              </div>
              <Toaster position="bottom-right" />
            </SidebarProvider>
          </DataProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
