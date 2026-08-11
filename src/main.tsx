import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import App from "./App";
import "./styles/global.css";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root element not found");

// HashRouter (not BrowserRouter): GitHub Pages serves static files with no
// server-side rewrite rule, so a deep link like /containers/abc needs to live
// in the URL fragment (#/containers/abc) to survive a hard refresh.
createRoot(rootEl).render(
  <StrictMode>
    <HashRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </HashRouter>
  </StrictMode>,
);
