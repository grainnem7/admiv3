import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/**
 * A link as a QR code: point the iPad's camera at it and tap the link that appears, rather
 * than typing a long address. Always black on white, whatever the theme — cameras read
 * dark-on-light codes most reliably.
 */
export function LinkQr({ url, size = 200 }: { url: string; size?: number }): JSX.Element | null {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 2, width: size, color: { dark: '#000000', light: '#ffffff' } })
      .then((d) => { if (alive) setSrc(d); })
      .catch(() => { if (alive) setSrc(null); });
    return () => { alive = false; };
  }, [url, size]);
  if (!src) return null;
  return (
    <img
      src={src}
      width={size}
      height={size}
      alt={`QR code for ${url}. Scan it with the iPad's camera.`}
      style={{ borderRadius: 'var(--bs-radius-md)', alignSelf: 'flex-start' }}
    />
  );
}
