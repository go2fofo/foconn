/*
 * @Author: fofo
 * @Date: 2026-06-08 13:33:05
 * @LastEditTime: 2026-06-08 14:28:24
 * @LastEditors: fofo
 * @Description: 
 * @FilePath: /foconn/src/main.tsx
 */
import { StrictMode } from "react";
import { ConfigProvider, theme } from "antd";
import zhCN from "antd/locale/zh_CN";
import "antd/dist/reset.css";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import "./i18n";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: "#55c7c2",
          colorInfo: "#5a8cff",
          colorSuccess: "#46c4a8",
          colorWarning: "#d3a23a",
          colorError: "#ef4444",
          borderRadius: 12,
          colorBgBase: "#050505",
          colorBgContainer: "#0c1020",
          colorBgElevated: "#0f172a",
          colorTextBase: "rgba(255, 255, 255, 0.88)",
        },
      }}
    >
      <App />
    </ConfigProvider>
  </StrictMode>,
);
