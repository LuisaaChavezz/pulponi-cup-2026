import { useEffect, useState } from 'react';

/**
 * Logo de selección (API-Football) con marco redondo neón Pulponi.
 * Si no hay URL o falla la carga → emoji bandera.
 */
export default function TeamLogo({ logo, flag, alt = '', size = 'md' }) {
  const [imgFailed, setImgFailed] = useState(false);
  const logoUrl = typeof logo === 'string' && logo.trim() ? logo.trim() : null;
  const showImage = Boolean(logoUrl) && !imgFailed;

  useEffect(() => {
    setImgFailed(false);
  }, [logoUrl]);

  const frameClass = `team-logo-frame team-logo-frame--${size}`;

  if (showImage) {
    return (
      <span className={frameClass}>
        <img
          src={logoUrl}
          alt={alt}
          className="team-logo"
          loading="lazy"
          decoding="async"
          onError={() => setImgFailed(true)}
        />
      </span>
    );
  }

  return (
    <span className={`${frameClass} team-logo-frame--emoji`} aria-hidden={!flag && !alt}>
      <span className="flag">{flag ?? '⚽'}</span>
    </span>
  );
}
