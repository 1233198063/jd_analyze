import { NavLink } from "react-router-dom";
import clsx from "clsx";
import Icon from "@/components/common/Icon";

const nav = [
  { to: "/", label: "Dashboard", icon: "dashboard" },
  { to: "/discoveries", label: "Discoveries", icon: "bolt" },
  { to: "/jobs/add", label: "Add JD", icon: "note_add" },
  { to: "/tracker", label: "Tracker", icon: "view_kanban" },
  { to: "/resume", label: "Resume", icon: "description" },
  { to: "/gaps", label: "Resume Gaps", icon: "insights" },
];

export default function Sidebar() {
  return (
    <aside className="w-56 flex-shrink-0 bg-ink border-r border-ink flex flex-col">
      <div className="px-5 py-5 border-b border-white/10">
        <h1 className="text-base font-bold text-white leading-tight">
          JD Analyze
        </h1>
        <p className="text-xs text-mist/60 mt-0.5">Job Intelligence</p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {nav.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              clsx(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                isActive
                  ? "bg-canvas text-ink font-semibold shadow-sm"
                  : "text-mist/70 hover:bg-white/10 hover:text-white"
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  name={icon}
                  size={18}
                  filled={isActive}
                  className={clsx("w-4 flex-shrink-0", isActive && "text-bubblegum-600")}
                />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="px-4 py-4 border-t border-white/10">
        <p className="text-xs text-mist/40">
          H-1B / OPT / STEM OPT
          <br />
          Job Search Intelligence
        </p>
      </div>
    </aside>
  );
}
