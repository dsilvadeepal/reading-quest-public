import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import Parent from "./Parent";
import "./styles.css";
import "./badge-celebration.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {location.pathname === "/parent" ? <Parent /> : <App />}
  </React.StrictMode>,
);
