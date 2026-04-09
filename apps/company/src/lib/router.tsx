"use client";

/**
 * Minimal react-router-dom compatibility shim over Next.js App Router.
 *
 * Components import `Link`, `NavLink`, `Navigate`, `useNavigate`,
 * `useLocation`, `useParams` and `Outlet` from `@/lib/router`. This
 * file implements just enough of that surface to run them inside
 * Next.js without modification.
 */

import * as React from "react";
import NextLink from "next/link";
import {
  useParams as useNextParams,
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";

export interface Location {
  pathname: string;
  search: string;
  hash: string;
  state: unknown;
  key: string;
}

export function useLocation(): Location {
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const search = searchParams && searchParams.toString() ? `?${searchParams.toString()}` : "";
  return { pathname, search, hash: "", state: null, key: pathname + search };
}

export function useParams<T extends Record<string, string | undefined> = Record<string, string | undefined>>(): T {
  return (useNextParams() as unknown as T) ?? ({} as T);
}

export type To = string | { pathname?: string; search?: string; hash?: string };

function toHref(to: To): string {
  if (typeof to === "string") return to;
  const pathname = to.pathname ?? "";
  const search = to.search ?? "";
  const hash = to.hash ?? "";
  return `${pathname}${search}${hash}`;
}

export interface LinkProps
  extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  to: To;
  replace?: boolean;
  prefetch?: boolean;
}

export const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { to, replace, prefetch = false, children, ...rest },
  ref,
) {
  return (
    <NextLink
      ref={ref}
      href={toHref(to)}
      replace={replace}
      prefetch={prefetch}
      {...rest}
    >
      {children}
    </NextLink>
  );
});

export interface NavLinkProps extends Omit<LinkProps, "className"> {
  className?:
    | string
    | ((args: { isActive: boolean; isPending: boolean }) => string | undefined);
  end?: boolean;
  children?:
    | React.ReactNode
    | ((args: { isActive: boolean; isPending: boolean }) => React.ReactNode);
}

function normalizePath(path: string): string {
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path;
}

export const NavLink = React.forwardRef<HTMLAnchorElement, NavLinkProps>(function NavLink(
  { to, end, className, children, style, ...rest },
  ref,
) {
  const location = useLocation();
  const href = toHref(to);
  const targetPath = normalizePath(href.split("?")[0].split("#")[0] || "/");
  const currentPath = normalizePath(location.pathname);
  const isActive = end
    ? currentPath === targetPath
    : currentPath === targetPath || currentPath.startsWith(`${targetPath}/`);
  const resolvedClassName =
    typeof className === "function" ? className({ isActive, isPending: false }) : className;
  const content =
    typeof children === "function" ? children({ isActive, isPending: false }) : children;

  return (
    <NextLink
      ref={ref}
      href={href}
      prefetch={false}
      className={resolvedClassName}
      style={style}
      data-active={isActive ? "true" : undefined}
      {...rest}
    >
      {content}
    </NextLink>
  );
});

export interface NavigateOptions {
  replace?: boolean;
  state?: unknown;
}

export function useNavigate() {
  const router = useRouter();
  return React.useCallback(
    (to: To | number, options?: NavigateOptions) => {
      if (typeof to === "number") {
        if (to === -1) router.back();
        else if (to === 1) router.forward();
        return;
      }
      const href = toHref(to);
      if (options?.replace) router.replace(href);
      else router.push(href);
    },
    [router],
  );
}

export function Navigate({ to, replace }: { to: To; replace?: boolean }) {
  const navigate = useNavigate();
  React.useEffect(() => {
    navigate(to, { replace });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

/**
 * `<Outlet/>` is a react-router concept that doesn't map 1:1 to Next.js
 * App Router (Next uses `children` on layouts). Ported components that
 * render `<Outlet/>` should use it as a placeholder that receives the
 * children from the surrounding layout via a context.
 */
const OutletContext = React.createContext<React.ReactNode>(null);

export function OutletProvider({
  children,
  outlet,
}: {
  children: React.ReactNode;
  outlet: React.ReactNode;
}) {
  return <OutletContext.Provider value={outlet}>{children}</OutletContext.Provider>;
}

export function Outlet(): React.ReactElement | null {
  const outlet = React.useContext(OutletContext);
  return outlet as React.ReactElement | null;
}
