/*
 * @Author: fofo
 * @Date: 2026-06-08 13:33:05
 * @LastEditTime: 2026-06-09 15:50:59
 * @LastEditors: fofo
 * @Description: 全量接管底层 WebView 右键，并完美兼容自定义组件右键
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

// 全域动态中文菜单构建器
const handleGlobalContextMenu = async (e: MouseEvent) => {
  let target = e.target as HTMLElement | null;

  // 向上递归查找，看看鼠标点中的地方，是不是你自定义右键的势力范围
  let isCustomMenuZone = false;
  while (target) {
    // 哥们注意：检查它是不是属于你的 FoconnContextMenu 或者其他自定义菜单包裹的节点
    // 你可以根据你自定义组件渲染出来的 className 包含什么来决定，比如通常包含 'context' 或 'menu'
    if (
      target.classList?.contains("foconn-context-menu-wrapper") || 
      target.tagName === "XTERM" || // 如果是终端渲染内部
      target.closest("[data-custom-menu]") // 或者你给自定义区加了特征属性
    ) {
      isCustomMenuZone = true;
      break;
    }
    target = target.parentElement;
  }

  // 💡 冲突释放：如果属于自定义右键区域，直接放行，把渲染权完全交给你的 React 组件！
  if (isCustomMenuZone) {
    return;
  }

  // 说明是其他系统空白区或通用输入框，执行无差别死锁，干掉原生英文菜单！
  e.preventDefault();

};

// ⚡ 注册监听：去掉最后的 true，改用冒泡阶段，让组件内部的 e.stopPropagation() 能够切断事件流
window.addEventListener("contextmenu", handleGlobalContextMenu);

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