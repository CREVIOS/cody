import { ThemeProvider } from "@/context/ThemeContext";
import { RolesProvider } from "@/context/RolesContext";
import "./globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider>
          <RolesProvider>
            {children}
          </RolesProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
