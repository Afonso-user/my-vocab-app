// 全局布局和底部导航
import { useLocation, Link } from "react-router-dom";
import { BookOpen, Plus } from "lucide-react";

const NAV_ITEMS = [
  { path: "/", label: "词书", icon: BookOpen },
  { path: "/import", label: "导入", icon: Plus },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();

  return (
    <div className="app-shell">
      <main className="main">{children}</main>
      <nav className="bottom-nav">
        {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
          const active = pathname === path;
          return (
            <Link
              key={path}
              to={path}
              className={`nav-item ${active ? "active" : ""}`}
            >
              <Icon size={20} />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
