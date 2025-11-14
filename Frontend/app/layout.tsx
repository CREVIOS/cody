import { ThemeProvider } from "@/context/ThemeContext";
import { RolesProvider } from "@/context/RolesContext";
import "./globals.css";
// Configure Monaco Editor workers before any Monaco components load
import "@/lib/monaco-config";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <ThemeProvider>
          <RolesProvider>
            {children}
          </RolesProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
