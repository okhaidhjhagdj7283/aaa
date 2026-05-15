import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Dead Drop - Self-Destructing File Sharing",
  description: "Share files that self-destruct after being read. AES-256 encrypted with on-chain proof on Aptos.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <main className="min-h-screen">
          <nav className="border-b border-gray-700 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-50">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
              <div className="flex justify-between items-center">
                <div>
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                    Dead Drop
                  </h1>
                  <p className="text-xs text-gray-500">encrypted · self-destructing · on-chain proof</p>
                </div>
                <div className="flex gap-2">
                  <button className="px-4 py-2 text-sm text-gray-400 hover:text-white transition">Send</button>
                  <button className="px-4 py-2 text-sm text-gray-400 hover:text-white transition">Receive</button>
                  <button className="px-4 py-2 text-sm text-gray-400 hover:text-white transition">Proof</button>
                </div>
              </div>
            </div>
          </nav>
          {children}
        </main>
      </body>
    </html>
  );
}
