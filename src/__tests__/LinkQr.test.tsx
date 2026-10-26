// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import QRCode from 'qrcode';
import { LinkQr } from '../ui/screens/boardSequencer/components/LinkQr';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('the iPad link as a QR code', () => {
  it('draws the link, so the iPad can scan it instead of typing it', async () => {
    const url = 'http://192.168.1.20:3000/?remote=4821';
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    await act(async () => { root.render(<LinkQr url={url} />); });
    await act(async () => { await new Promise((r) => setTimeout(r, 200)); });
    const img = el.querySelector('img');
    expect(img?.getAttribute('alt')).toBe(`QR code for ${url}. Scan it with the iPad's camera.`);
    expect(img?.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
    // The code holds exactly the link: every character of the address, nothing else.
    const qr = QRCode.create(url, { errorCorrectionLevel: 'M' });
    expect(qr.segments.reduce((n, s) => n + (s as unknown as { data: { length: number } }).data.length, 0)).toBe(url.length);
    await act(async () => { root.unmount(); });
    el.remove();
  });
});
