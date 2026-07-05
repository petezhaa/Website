import { CheeseMode } from "@/components/CheeseMode";
import type { Metadata } from "next";
import { Caveat, Inter, JetBrains_Mono, Newsreader } from "next/font/google";
import "./globals.css";

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin"],
  weight: ["500", "600"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://petezha.xyz"),
  title: "Peter Zhao · maps, GPUs, and a bot that texts back",
  description:
    "Peter Zhao, a student engineer at UW–Madison studying computer science, electrical engineering, and math. GPU systems at NVIDIA, Azure Search at Microsoft, AWS at Amazon. Also: a 12-game arcade running Rust, C++, Go, and real Java bytecode in your browser.",
  openGraph: {
    title: "Peter Zhao",
    description:
      "Engineering student at UW–Madison. Maps, GPUs, and a bot that texts back.",
    url: "https://petezha.xyz",
    siteName: "Peter Zhao",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Pixel Peter says hi" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Peter Zhao",
    description:
      "Engineering student at UW–Madison. Maps, GPUs, and a bot that texts back.",
    images: ["/og.png"],
  },
};

// set the theme class before paint so there's no flash
const themeInit = `(function(){try{var t=localStorage.getItem("theme");if(t==="dark"||(!t&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}})()`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${newsreader.variable} ${inter.variable} ${jetbrainsMono.variable} ${caveat.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="min-h-full flex flex-col font-sans">
        {children}
        <CheeseMode />
      </body>
    </html>
  );
}
