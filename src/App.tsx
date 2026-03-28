import { ConvexProvider, ConvexReactClient } from "convex/react";
import SubmitForm from "./pages/SubmitForm";
import About from "./pages/About";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

// Simple token-based routing
function Router() {
  const path = window.location.pathname;

  if (path === "/about") {
    return <About />;
  }

  const match = path.match(/^\/submit\/([^/]+)$/);
  if (match) {
    return <SubmitForm token={match[1]} />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-semibold">Studio Andreas Payroll</h1>
        <p className="text-muted-foreground">
          Use the link from your email to submit your hours.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ConvexProvider client={convex}>
      <Router />
    </ConvexProvider>
  );
}
