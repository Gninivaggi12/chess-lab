/// <reference types="vite/client" />
import "./style.css";
import { mountApp } from "../ui/index.ts";
import { registerServiceWorker } from "./sw-register.ts";

mountApp(document.getElementById("app")!, {});
registerServiceWorker();
