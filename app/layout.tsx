import type { Metadata } from "next";
import "./globals.css";
import AuthProvider from "@/components/AuthProvider";
import Navbar from "@/components/Navbar";

export const metadata: Metadata = {
  title: "muu space 心理探索",
  description: "讓故事被聽見，也讓最近的自己有地方停一下。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@300;400;500;600&family=Noto+Sans+TC:wght@300;400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>

      <body>
        <AuthProvider>
          <Navbar />

          {/* ✅ 全站統一內容結構 */}
          <main className="pt-14">
            <div className="max-w-5xl mx-auto px-4">
              {children}
            </div>
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}