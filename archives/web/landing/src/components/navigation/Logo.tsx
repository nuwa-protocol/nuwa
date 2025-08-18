import Link from "next/link";

export const Logo = () => {
  return (
    <Link href="/">
      <img
        src="/nuwa-logo-horizontal.svg"
        alt="Nuwa Logo"
        height="auto"
        width="120"
        className="h-auto"
      />
    </Link>
  );
};

export const LogoSmall = () => {
  return (
    <Link href="/">
      <img
        src="/nuwa-logo-horizontal.svg"
        alt="Nuwa Logo"
        width="60"
        height="auto"
        className="h-auto"
      />
    </Link>
  );
};

export const LogoThumbnail = () => {
  return (
    <Link href="/">
      <img
        src="/nuwa.svg"
        alt="Nuwa Logo"
        width="32"
        height="auto"
        className="h-auto"
      />
    </Link>
  );
};

export const LogoLarge = () => {
  return (
    <Link href="/">
      <img
        src="/nuwa-logo-horizontal.svg"
        alt="Nuwa Logo"
        width="180"
        height="auto"
        className="mb-3 h-auto"
      />
    </Link>
  );
};
