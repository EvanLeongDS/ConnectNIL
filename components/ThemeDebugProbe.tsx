"use client";

import { useEffect } from "react";

function postDebug(message: string, data: Record<string, unknown>, hypothesisId: string, runId: string) {
  // #region agent log
  fetch("http://127.0.0.1:7364/ingest/e4562ef6-100d-491e-9aae-be85661ee21a", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "742ebd",
    },
    body: JSON.stringify({
      sessionId: "742ebd",
      runId,
      hypothesisId,
      location: "components/ThemeDebugProbe.tsx:15",
      message,
      data,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
}

export default function ThemeDebugProbe({ label }: { label: string }) {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const theme = (() => {
      try {
        return localStorage.getItem("theme");
      } catch {
        return null;
      }
    })();

    const bodyStyle = window.getComputedStyle(body);
    const htmlStyle = window.getComputedStyle(html);

    postDebug(
      "Theme snapshot",
      {
        label,
        localStorage_theme: theme,
        html_class: html.className,
        html_has_dark: html.classList.contains("dark"),
        body_class: body.className,
        computed_body_bg: bodyStyle.backgroundColor,
        computed_body_color: bodyStyle.color,
        computed_html_bg: htmlStyle.backgroundColor,
        computed_html_color: htmlStyle.color,
      },
      "H1",
      "pre-fix"
    );
  }, [label]);

  return null;
}

