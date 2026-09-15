import React, { useEffect, useState } from 'react';
import { Heart } from 'lucide-react';

type StudioMarkProps = {
  name: string;
  logoUrl: string | null;
  showLogo: boolean;
  showName: boolean;
  variant: 'sidebar' | 'auth';
};

const StudioMark: React.FC<StudioMarkProps> = ({
  name,
  logoUrl,
  showLogo,
  showName,
  variant,
}) => {
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [logoUrl]);

  const logoVisible = Boolean(showLogo && logoUrl && !imgFailed);

  if (variant === 'sidebar') {
    const nameVisible = !logoVisible || showName;
    return (
      <div className="space-y-2">
        {logoVisible ? (
          <img
            src={logoUrl ?? undefined}
            alt={name}
            className="h-10 w-auto max-w-[160px] object-contain"
            onError={() => setImgFailed(true)}
          />
        ) : null}
        {nameVisible ? <h1 className="text-2xl font-medium text-text">{name}</h1> : null}
      </div>
    );
  }

  if (logoVisible) {
    return (
      <img
        src={logoUrl ?? undefined}
        alt={name}
        className="mx-auto h-16 w-auto max-w-[220px] object-contain"
        onError={() => setImgFailed(true)}
      />
    );
  }

  return (
    <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-brand">
      <Heart className="h-8 w-8 text-onBrand" />
    </div>
  );
};

export default StudioMark;
