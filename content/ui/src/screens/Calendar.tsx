import { useState, useMemo } from "react";
import { useApi } from "../hooks/useApi";
import { useRealtimeRevalidation } from "../hooks/useWebSocket";
import { useUrlFilters } from "../hooks/useUrlFilters";
import { getCalendar } from "../api/client";
import type { CalendarItem, ApprovalStatus } from "../api/types";
import { LoadingSkeleton } from "../components/LoadingState";
import { ErrorBlock } from "../components/ErrorBlock";
import { EmptyState } from "../components/EmptyState";
import { Badge } from "../components/Badge";
import "./Calendar.css";

type ViewMode = "month" | "week" | "agenda";
type Grouping = "none" | "brand" | "destination";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function approvalBadge(status: ApprovalStatus | "none") {
  const map: Record<string, { variant: "success" | "warning" | "danger" | "muted" | "info"; label: string }> = {
    approved: { variant: "success", label: "Approved" },
    pending: { variant: "warning", label: "Pending" },
    rejected: { variant: "danger", label: "Rejected" },
    expired: { variant: "muted", label: "Expired" },
    cancelled: { variant: "muted", label: "Cancelled" },
    none: { variant: "info", label: "No approval" },
  };
  const b = map[status] ?? map.none;
  return <Badge variant={b.variant}>{b.label}</Badge>;
}

function kindIcon(kind: string): string {
  const map: Record<string, string> = {
    linkedin_post: "in",
    bluesky_post: "BS",
    mastodon_post: "M",
    webhook: "WH",
    blog_post: "BG",
    website_page: "WP",
  };
  return map[kind] ?? "?";
}

function getMonthDays(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const startDay = first.getDay();
  const days: Date[] = [];
  for (let i = -startDay; i < 42 - startDay; i++) {
    days.push(new Date(year, month, 1 + i));
  }
  return days;
}

function getWeekDays(base: Date): Date[] {
  const start = new Date(base);
  start.setDate(start.getDate() - start.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function CalendarScreen() {
  const { filters, setFilter } = useUrlFilters(["view", "grouping", "conflict"]);
  const view = (filters.view as ViewMode) || "month";
  const grouping = (filters.grouping as Grouping) || "none";
  const conflictOnly = filters.conflict === "true";

  const [currentDate, setCurrentDate] = useState(() => new Date());

  const { status, data, error, reload } = useApi<{ items: CalendarItem[] }>(getCalendar);
  useRealtimeRevalidation(["plan.created", "plan.cancelled", "plan.executed", "approval.reviewed"], reload);

  const items = data?.items ?? [];

  const grouped = useMemo(() => {
    let filtered = items;
    if (conflictOnly) {
      // Show items where approval is pending or rejected
      filtered = filtered.filter((i) => i.approvalStatus === "pending" || i.approvalStatus === "rejected");
    }
    return filtered;
  }, [items, conflictOnly]);

  function itemsForDay(day: Date): CalendarItem[] {
    return grouped.filter((item) => isSameDay(new Date(item.scheduledAt), day));
  }

  function navigatePrev() {
    const d = new Date(currentDate);
    if (view === "month") d.setMonth(d.getMonth() - 1);
    else d.setDate(d.getDate() - 7);
    setCurrentDate(d);
  }

  function navigateNext() {
    const d = new Date(currentDate);
    if (view === "month") d.setMonth(d.getMonth() + 1);
    else d.setDate(d.getDate() + 7);
    setCurrentDate(d);
  }

  if (status === "loading") return <div data-testid="content-calendar"><LoadingSkeleton rows={10} /></div>;
  if (status === "error") return <div data-testid="content-calendar"><ErrorBlock message={error!} onRetry={reload} /></div>;

  const monthDays = getMonthDays(currentDate.getFullYear(), currentDate.getMonth());
  const weekDays = getWeekDays(currentDate);
  const today = new Date();

  return (
    <div data-testid="content-calendar" className="cal">
      <div className="cal__header">
        <h1 className="cal__title">Calendar</h1>
        <div className="cal__controls">
          {/* View switcher */}
          <div data-testid="calendar-view-switcher" className="tabs" style={{ borderBottom: "none" }}>
            {(["month", "week", "agenda"] as ViewMode[]).map((m) => (
              <button key={m} className={`tab ${view === m ? "tab--active" : ""}`} onClick={() => setFilter("view", m)}>
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>

          {/* Grouping */}
          <select
            data-testid="calendar-grouping-control"
            className="input"
            style={{ width: "auto" }}
            value={grouping}
            onChange={(e) => setFilter("grouping", e.target.value)}
          >
            <option value="none">No grouping</option>
            <option value="brand">Group by brand</option>
            <option value="destination">Group by destination</option>
          </select>

          {/* Conflict filter */}
          <label className="flex items-center gap-1" style={{ fontSize: "var(--fs-sm)" }}>
            <input type="checkbox" checked={conflictOnly} onChange={(e) => setFilter("conflict", e.target.checked ? "true" : "")} />
            Conflicts only
          </label>

          <button className="btn btn--secondary btn--sm" onClick={reload}>Refresh</button>
        </div>
      </div>

      {/* Legend */}
      <div className="cal__legend">
        <span className="cal__legend-item"><span className="cal__legend-dot" style={{ background: "var(--c-success)" }} /> Published</span>
        <span className="cal__legend-item"><span className="cal__legend-dot" style={{ background: "var(--c-accent)" }} /> Scheduled</span>
        <span className="cal__legend-item"><span className="cal__legend-dot" style={{ background: "var(--c-warning)" }} /> Pending approval</span>
        <span className="cal__legend-item"><span className="cal__legend-dot" style={{ background: "var(--c-danger)" }} /> Failed / Rejected</span>
        <span className="cal__legend-item"><span className="cal__legend-dot" style={{ background: "var(--c-info)" }} /> Autopublish</span>
        <span className="cal__legend-item"><span className="cal__legend-dot" style={{ background: "var(--c-neutral)" }} /> Manual</span>
      </div>

      {/* Navigation */}
      {view !== "agenda" && (
        <div className="cal__nav">
          <button className="btn btn--ghost btn--sm" onClick={navigatePrev}>←</button>
          <span className="cal__nav-label">
            {view === "month"
              ? `${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`
              : `Week of ${weekDays[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
            }
          </span>
          <button className="btn btn--ghost btn--sm" onClick={navigateNext}>→</button>
          <button className="btn btn--ghost btn--sm" onClick={() => setCurrentDate(new Date())}>Today</button>
        </div>
      )}

      {/* Month view */}
      {view === "month" && (
        <div className="cal-month">
          <div className="cal-month__header">
            {DAY_NAMES.map((d) => <div key={d} className="cal-month__day-name">{d}</div>)}
          </div>
          <div className="cal-month__grid">
            {monthDays.map((day, i) => {
              const dayItems = itemsForDay(day);
              const isCurrentMonth = day.getMonth() === currentDate.getMonth();
              const isToday = isSameDay(day, today);
              return (
                <div key={i} className={`cal-month__cell ${isCurrentMonth ? "" : "cal-month__cell--other"} ${isToday ? "cal-month__cell--today" : ""}`}>
                  <div className="cal-month__date">{day.getDate()}</div>
                  {dayItems.slice(0, 3).map((item) => (
                    <div key={item.planId} className="cal-month__item" data-status={item.planStatus} title={`${item.title} — ${item.destination.name}`}>
                      <span className="cal-month__item-kind">{kindIcon(item.destination.kind)}</span>
                      <span className="truncate">{item.title}</span>
                    </div>
                  ))}
                  {dayItems.length > 3 && <div className="cal-month__more">+{dayItems.length - 3} more</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Week view */}
      {view === "week" && (
        <div className="cal-week">
          {weekDays.map((day) => {
            const dayItems = itemsForDay(day);
            const isToday = isSameDay(day, today);
            return (
              <div key={day.toISOString()} className={`cal-week__col ${isToday ? "cal-week__col--today" : ""}`}>
                <div className="cal-week__header">
                  <span className="cal-week__day">{DAY_NAMES[day.getDay()]}</span>
                  <span className="cal-week__num">{day.getDate()}</span>
                </div>
                <div className="cal-week__items">
                  {dayItems.map((item) => (
                    <div key={item.planId} className="cal-week__item card card--clickable" data-status={item.planStatus}>
                      <div className="flex items-center gap-1">
                        <span className="cal-month__item-kind">{kindIcon(item.destination.kind)}</span>
                        <span className="truncate" style={{ fontWeight: 600, fontSize: "var(--fs-sm)" }}>{item.title}</span>
                      </div>
                      <div style={{ fontSize: "var(--fs-xs)", color: "var(--c-text-muted)" }}>{item.destination.name}</div>
                      <div className="flex gap-1" style={{ marginTop: "var(--sp-1)" }}>
                        {approvalBadge(item.approvalStatus)}
                        <Badge variant={item.planStatus === "scheduled" ? "accent" : "success"}>{item.planStatus}</Badge>
                      </div>
                      {item.canReschedule && <div style={{ fontSize: "var(--fs-xs)", color: "var(--c-accent)", marginTop: 2 }}>Drag to reschedule</div>}
                    </div>
                  ))}
                  {dayItems.length === 0 && <div style={{ fontSize: "var(--fs-xs)", color: "var(--c-text-muted)", padding: "var(--sp-3)", textAlign: "center" }}>No items</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Agenda view */}
      {view === "agenda" && (
        <div className="cal-agenda">
          {grouped.length === 0 ? (
            <EmptyState icon="📅" title="No scheduled items" />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Title</th>
                    <th>Destination</th>
                    <th>Status</th>
                    <th>Approval</th>
                    <th>Reschedule</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped.map((item) => (
                    <tr key={item.planId}>
                      <td className="mono">{new Date(item.scheduledAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                      <td style={{ fontWeight: 600 }}>{item.title}</td>
                      <td>
                        <span className="flex items-center gap-1">
                          <span style={{ fontWeight: 700, fontSize: "var(--fs-xs)" }}>{kindIcon(item.destination.kind)}</span>
                          {item.destination.name}
                        </span>
                      </td>
                      <td><Badge variant={item.planStatus === "scheduled" ? "accent" : "success"}>{item.planStatus}</Badge></td>
                      <td>{approvalBadge(item.approvalStatus)}</td>
                      <td>{item.canReschedule ? <span style={{ color: "var(--c-accent)" }}>Yes</span> : <span style={{ color: "var(--c-text-muted)" }}>No</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div style={{ fontSize: "var(--fs-xs)", color: "var(--c-text-muted)", marginTop: "var(--sp-4)" }}>
        {grouped.length} item{grouped.length !== 1 ? "s" : ""} total
      </div>
    </div>
  );
}
