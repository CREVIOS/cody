import { ThemeProvider } from "@/context/ThemeContext";
import { RolesProvider } from "@/context/RolesContext";
import { AuthProvider } from "@/context/AuthContext";
import "./globals.css";
// Configure Monaco Editor workers before any Monaco components load
import "@/lib/monaco-config";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <AuthProvider>
          <ThemeProvider>
            <RolesProvider>
              {children}
            </RolesProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
