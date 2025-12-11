import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "./components/AuthProvider";

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
        {/* 🔥 在這裡包起來，讓整個 App 都能用匿名登入 */}
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
