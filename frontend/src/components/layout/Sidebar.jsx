import { NavLink } from "react-router-dom";
import clsx from "clsx";

const nav = [
  { to: "/", label: "Dashboard", icon: "◈" },
  { to: "/jobs/add", label: "Add JD", icon: "+" },
  { to: "/tracker", label: "Tracker", icon: "⬚" },
  { to: "/resume", label: "Resume", icon: "≡" },
];

export default function Sidebar() {
  return (
    <aside className="w-56 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">
      <div className="px-5 py-5 border-b border-gray-200">
        <h1 className="text-base font-bold text-gray-900 leading-tight">
          JD Analyze
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">Job Intelligence</p>
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
                  ? "bg-blue-50 text-blue-700 font-medium"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              )
            }
          >
            <span className="text-base w-4 text-center">{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="px-4 py-4 border-t border-gray-200">
        <p className="text-xs text-gray-400">
          H-1B / OPT / STEM OPT
          <br />
          Job Search Intelligence
        </p>
      </div>
    </aside>
  );
}
