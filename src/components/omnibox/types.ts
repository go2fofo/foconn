import type { QuickConnectProtocol } from '../../types';

export type OmniboxOpenContext = 'dashboard' | 'workspace';
export type OmniboxTabView = 'BOOKMARKS' | 'QUICK_COMMANDS';

export interface OmniboxTabConfigItem {
  id: string;
  labelKey: string;
  titleKey: string;
  descriptionKey: string;
  view: OmniboxTabView;
  showSearch: boolean;
  showDashboardConnections: boolean;
}

export interface OmniboxTabsConfig {
  initialTabByContext: Record<OmniboxOpenContext, string>;
  tabs: OmniboxTabConfigItem[];
}

export interface OmniboxTabRendererProps {
  keyword: string;
  openContext: OmniboxOpenContext;
  activeTab: OmniboxTabConfigItem;
  onOpenProtocolTab: (config: {
    title: string;
    protocol: QuickConnectProtocol;
    host?: string;
    port?: number;
    username?: string;
    authType?: 'PASSWORD' | 'KEYPAIR';
    secretRef?: string;
    description?: string;
  }) => void;
  onOpenLocalTerminal: () => void;
  closePopover: () => void;
}
