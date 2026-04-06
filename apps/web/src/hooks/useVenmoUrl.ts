import { useEffect, useState } from "react";

export function useVenmoUrl(
  username: string,
  amount: number,
  note: string
): string {
  const webUrl = `https://account.venmo.com/pay?recipients=${encodeURIComponent(username)}&amount=${amount.toFixed(2)}&note=${encodeURIComponent(note)}&txn=pay`;
  const [url, setUrl] = useState(webUrl);

  useEffect(() => {
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile) {
      setUrl(
        `venmo://paycharge?txn=pay&recipients=${encodeURIComponent(username)}&amount=${amount.toFixed(2)}&note=${encodeURIComponent(note)}`
      );
    } else {
      setUrl(
        `https://account.venmo.com/pay?recipients=${encodeURIComponent(username)}&amount=${amount.toFixed(2)}&note=${encodeURIComponent(note)}&txn=pay`
      );
    }
  }, [username, amount, note]);

  return url;
}
