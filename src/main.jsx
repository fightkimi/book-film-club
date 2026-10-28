import React from "react";
import { createRoot } from "react-dom/client";
import { Theme } from "@radix-ui/themes";
import "@radix-ui/themes/styles.css";
import "@fontsource-variable/montserrat";
import "@fontsource/libre-caslon-display";
import "@fontsource-variable/noto-sans-sc";
import "@fontsource-variable/noto-serif-sc";
import App from "./App.jsx";
import "./styles.css";
import "./controls.css";
createRoot(document.getElementById("root")).render(
  <Theme accentColor="gray" grayColor="sand" radius="full">
    <App />
  </Theme>,
);
