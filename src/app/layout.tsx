import '@mantine/core/styles.css';
import { ColorSchemeScript, MantineProvider, mantineHtmlProps, createTheme } from '@mantine/core';
import type { Metadata } from 'next';

const theme = createTheme({
  fontFamily: 'monospace',
  primaryColor: 'green',
  defaultRadius: 'sm',
});

export const metadata: Metadata = {
  title: 'HomeLab Status Monitor',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" {...mantineHtmlProps}>
      <head>
        <ColorSchemeScript defaultColorScheme="dark" />
      </head>
      <body style={{ backgroundColor: '#0a0a0a', margin: 0 }}>
        <MantineProvider theme={theme} defaultColorScheme="dark">
          {children}
        </MantineProvider>
      </body>
    </html>
  );
}
