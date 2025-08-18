import React from "react";
import { SiX } from "react-icons/si";
import { IconType } from "react-icons";
import Link from "next/link";
import { Logo } from "../navigation/Logo";
import { NAV_LINKS } from "../navigation/DesktopLinks";
import { BsGithub } from "react-icons/bs";

const FOOTER_TEXTS = {
  copyright: "© Nuwa.dev - All rights reserved.",
  socialLinks: [
    {
      title: "Twitter",
      href: "https://x.com/nuwadev"
    },
    {
      title: "Github",
      href: "https://github.com/rooch-network/nuwa"
    }
  ]
};

const Footer = () => {
  return (
    <div className="bg-white">
      <footer className="relative mx-auto max-w-6xl overflow-hidden py-12">
        <div className="md:px4 grid grid-cols-12 gap-x-1.5 gap-y-6 px-2">
          <LogoColumn />
          <GenericColumn title="Navigation" links={NAV_LINKS} />
          <GenericColumn
            title="Socials"
            links={[
              {
                title: FOOTER_TEXTS.socialLinks[0].title,
                href: FOOTER_TEXTS.socialLinks[0].href,
                Icon: SiX,
              },
              {
                title: FOOTER_TEXTS.socialLinks[1].title,
                href: FOOTER_TEXTS.socialLinks[1].href,
                Icon: BsGithub,
              }
            ]}
          />
        </div>
      </footer>
    </div>
  );
};

const LogoColumn = () => {
  return (
    <div className="col-span-6 md:col-span-4">
      <Logo />
      <span className="mt-3 inline-block text-xs">
        {FOOTER_TEXTS.copyright}
      </span>
    </div>
  );
};

const GenericColumn = ({
  title,
  links,
}: {
  title: string;
  links: { title: string; href: string; Icon?: IconType }[];
}) => {
  return (
    <div className="col-span-6 space-y-2 text-sm md:col-span-2">
      <span className="block font-bold">{title}</span>
      {links.map((l) => (
        <Link
          key={l.title}
          href={l.href}
          {...(title === "Socials" ? { target: "_blank" } : {})}
          className="flex items-center gap-1.5 transition-colors hover:text-indigo-600 hover:underline"
        >
          {l.Icon && <l.Icon />}
          {l.title}
        </Link>
      ))}
    </div>
  );
};

export default Footer;
