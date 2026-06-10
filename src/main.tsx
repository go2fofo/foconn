/*
 * @Author: fofo
 * @Date: 2026-06-08 13:33:05
 * @LastEditTime: 2026-06-10 14:34:10
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
          // 🔑 核心蓝绿色（Teal），亮丽且极具科技感
          colorPrimary: "#00bfa5", 
          
          // 🔑 辅助信息色，调整为偏青的冷蓝色，与蓝绿更搭
          colorInfo: "#00b0ff", 
          
          // 成功状态采用偏翠绿的蓝绿
          colorSuccess: "#10b981", 
          
          // 警告色与错误色微调，使其在暗青色背景下更沉稳
          colorWarning: "#f59e0b",
          colorError: "#f43f5e",
          borderRadius: 12,
          
          // 🔑 基础底色：更换为极深邃的暗蓝绿黑（#070d14）
          colorBgBase: "#070d14", 
          
          // 🔑 容器底色：微调为带有高级蓝绿内敛质感的暗色块（#0b1520）
          colorBgContainer: "#0b1520", 
          
          // 悬浮层/下拉菜单底色：采用略微透亮的青灰黑（#111e2e）
          colorBgElevated: "#111e2e", 
          
          // 基础文字颜色：保持高对比度的清爽白
          colorTextBase: "rgba(255, 255, 255, 0.92)",
        },
      }}
    >
      <App />
    </ConfigProvider>
  </StrictMode>,
);