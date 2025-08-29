import "./index.css";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.js";
import { ThemeProvider } from "./lib/theme-provider";


ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey="capui-theme">
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
