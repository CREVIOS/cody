import { ThemeProvider } from "@/context/ThemeContext";
import { RolesProvider } from "@/context/RolesContext";
import { AuthProvider } from "@/context/AuthContext";
import "./globals.css";
// Configure Monaco Editor workers before any Monaco components load
import "@/lib/monaco-config";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  const theme = localStorage.getItem('theme');
                  if (theme === 'light' || theme === 'dark') {
                    document.documentElement.classList.remove('light', 'dark');
                    document.documentElement.classList.add(theme);
                  } else {
                    document.documentElement.classList.add('dark');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
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
