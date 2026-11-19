import { createRoot } from "react-dom/client";
import "./theme/tokens.css";
import "./theme/base.css";
import "./theme/shell.css";
import "./styles.css";
import { App } from "./App.tsx";

const root = document.getElementById("root");
if (!root) throw new Error("Missing application root");
createRoot(root).render(<App />);
