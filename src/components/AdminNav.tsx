import { C } from "@/lib/admin";

type Props = {
  current: "payroll" | "history";
  onLogOut?: () => void;
};

const LINKS = [
  { key: "payroll", label: "Payroll", href: "/admin" },
  { key: "history", label: "History", href: "/history" },
] as const;

export default function AdminNav({ current, onLogOut }: Props) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 24,
      }}
    >
      {LINKS.map((link) => {
        const active = link.key === current;
        return (
          <a
            key={link.key}
            href={link.href}
            style={{
              padding: "6px 14px",
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
              background: active ? C.green : "transparent",
              color: active ? C.white : C.green,
              border: `1px solid ${active ? C.green : "rgba(52,71,52,0.3)"}`,
            }}
          >
            {link.label}
          </a>
        );
      })}
      {onLogOut && (
        <button
          onClick={onLogOut}
          style={{
            marginLeft: "auto",
            padding: "6px 14px",
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 600,
            background: "transparent",
            color: "#888",
            border: "1px solid rgba(0,0,0,0.15)",
            cursor: "pointer",
          }}
        >
          Log out
        </button>
      )}
    </div>
  );
}
