import type { Metadata } from "next";
import "./globals.css";
import Navbar from "../components/Navbar";
import { DM_Sans, Fraunces } from "next/font/google";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";

const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-sans" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-display" });


// Defina a URL base para facilitar a manutenção
const siteUrl = "https://cantina-igreja.vercel.app";

export const metadata: Metadata = {
  title: "Cantina PIB | Sistema",
  description: "Gerenciamento de pedidos e estoque da Cantina",
  
  icons: {
    icon: "/Logotipo_blue.png",
    apple: "/Logotipo_blue.png",
    // Se quiser que o ícone fique perfeito em Android/Chrome, adicione o shortcut:
    shortcut: "/Logotipo_blue.png",
  },

  openGraph: {
    title: "Cantina PIB",
    description: "Faça seu pedido e acompanhe a cozinha em tempo real.",
    url: siteUrl,
    siteName: "Cantina App",
    images: [
      {
        // Usar a URL completa aqui garante que o WhatsApp sempre encontre o logo
        url: `${siteUrl}/Logotipo_blue.png`, 
        width: 1200,
        height: 630,
        alt: "Logo Cantina PIB",
      },
    ],
    locale: "pt_BR",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning className={cn("font-sans", dmSans.variable, fraunces.variable)}>
      <body suppressHydrationWarning>
        <ThemeProvider attribute="class" forcedTheme="light" enableSystem={false} disableTransitionOnChange>
          <TooltipProvider>
            <Navbar />
            <main>{children}</main>
            <Toaster position="top-right" richColors />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
