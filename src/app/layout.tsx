import './globals.css';
import { Providers } from './providers';

export const metadata = {
  title: 'Agora',
  description: 'Agora — AI 模型互相辩论，帮你做更好的决策',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
