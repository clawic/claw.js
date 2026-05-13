"use client";

import { Fragment } from "react";
import { ChevronRight } from "lucide-react";
import { Link } from "@/lib/router";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useCompany } from "@/context/CompanyContext";
import { cn } from "@/lib/utils";

export function BreadcrumbBar({ className }: { className?: string }) {
  const { breadcrumbs } = useBreadcrumbs();
  const { selectedCompany } = useCompany();

  const items = selectedCompany
    ? [{ label: selectedCompany.name, to: "/dashboard" }, ...breadcrumbs]
    : breadcrumbs;

  if (items.length === 0) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn(
        "flex h-10 shrink-0 items-center gap-1.5 border-b border-border bg-background/60 px-4 text-[12px] text-muted-foreground",
        className,
      )}
    >
      {items.map((crumb, index) => {
        const isLast = index === items.length - 1;
        return (
          <Fragment key={`${crumb.label}-${index}`}>
            {index > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground/60" />}
            {crumb.to && !isLast ? (
              <Link
                to={crumb.to}
                className="truncate hover:text-foreground transition-colors"
              >
                {crumb.label}
              </Link>
            ) : (
              <span
                className={cn(
                  "truncate",
                  isLast ? "text-foreground font-medium" : undefined,
                )}
              >
                {crumb.label}
              </span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
