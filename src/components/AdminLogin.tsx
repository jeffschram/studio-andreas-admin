import { useState } from "react";
import { C } from "@/lib/admin";

type Props = {
  title: string;
  error?: string | null;
  onSubmit: (password: string) => void;
};

export default function AdminLogin({ title, error, onSubmit }: Props) {
  const [password, setPassword] = useState("");

  return (
    <div
      style={{
        background: C.cream,
        minHeight: "100vh",
        fontFamily: "system-ui, -apple-system, sans-serif",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(password);
        }}
        style={{
          background: C.white,
          padding: 40,
          borderRadius: 12,
          boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
          maxWidth: 380,
          width: "100%",
        }}
      >
        <p
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.15em",
            color: C.green,
            textTransform: "uppercase",
            marginBottom: 8,
          }}
        >
          Studio Andreas
        </p>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 24px", color: C.black }}>
          {title}
        </h1>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Admin password"
          style={{
            width: "100%",
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid #ddd",
            fontSize: 15,
            marginBottom: 16,
            boxSizing: "border-box",
          }}
        />
        {error && (
          <p style={{ fontSize: 13, color: "#991b1b", margin: "0 0 16px" }}>{error}</p>
        )}
        <button
          type="submit"
          style={{
            width: "100%",
            padding: "10px 0",
            borderRadius: 8,
            background: C.green,
            color: C.white,
            fontSize: 15,
            fontWeight: 600,
            border: "none",
            cursor: "pointer",
          }}
        >
          Log In
        </button>
      </form>
    </div>
  );
}
