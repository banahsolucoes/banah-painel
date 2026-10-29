import type { Metadata } from "next";
import { Archivo, Manrope } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

// Mesmas fontes do site banahdigital.com.br: Manrope no texto, Archivo nos títulos.
const manrope = Manrope({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const archivo = Archivo({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Painel BANAH",
  description: "Saúde e gestão das contas de marketplace",
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={`${manrope.variable} ${archivo.variable}`}>
      <body>{children}</body>
    </html>
  );
}
