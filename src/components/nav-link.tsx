"use client";

import Link, { useLinkStatus } from "next/link";

/** Enlace de filtro/pestaña que se nota pulsado mientras carga la lista. */
export function NavLink({
  href,
  className,
  children,
  ...rest
}: { href: string; className?: string; children: React.ReactNode } & Omit<React.ComponentProps<typeof Link>, "href">) {
  return (
    <Link href={href} scroll={false} className={className} {...rest}>
      <Pending>{children}</Pending>
    </Link>
  );
}

function Pending({ children }: { children: React.ReactNode }) {
  const { pending } = useLinkStatus();
  return <span className={pending ? "animate-pulse opacity-60" : undefined}>{children}</span>;
}
