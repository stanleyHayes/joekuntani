"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import styles from "./auth-form.module.css";

type MFAQRProps = {
  otpauthUri: string;
};

export function MFAQR({ otpauthUri }: MFAQRProps) {
  const [dataUrl, setDataUrl] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setDataUrl("");
    void QRCode.toDataURL(otpauthUri, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 220,
      color: { dark: "#14110c", light: "#ffffff" },
    })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [otpauthUri]);

  if (failed) {
    return (
      <p className={styles.qrFallback} role="status">
        QR could not be drawn. Use the secret or authenticator link below.
      </p>
    );
  }

  if (!dataUrl) {
    return (
      <div className={styles.qrSkeleton} aria-hidden="true">
        Generating QR…
      </div>
    );
  }

  return (
    <figure className={styles.qrFigure}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt="Scan this QR code with your authenticator app"
        className={styles.qrImage}
        height={220}
        src={dataUrl}
        width={220}
      />
      <figcaption className={styles.qrCaption}>
        Scan with Google Authenticator, 1Password, Authy, or similar
      </figcaption>
    </figure>
  );
}
