import "./globals.css";
import { NuqsAdapter } from "nuqs/adapters/next/app";

export const metadata = {
  title: "OpenCode Session Viewer",
  description: "View your OpenCode sessions",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <NuqsAdapter>{children}</NuqsAdapter>
      </body>
    </html>
  );
}
