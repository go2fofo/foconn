import { lazy } from 'react';
import type { ReactNode } from 'react';
import type { OmniboxTabRendererProps, OmniboxTabView } from './types';

const OmniboxBookmarkTab = lazy(async () => {
  const module = await import('../OmniboxBookmarkTab');
  return { default: module.OmniboxBookmarkTab };
});

const OmniboxQuickCommandsTab = lazy(async () => {
  const module = await import('../OmniboxQuickCommandsTab');
  return { default: module.OmniboxQuickCommandsTab };
});

type OmniboxTabRenderer = (props: OmniboxTabRendererProps) => ReactNode;

export const OMNIBOX_TAB_REGISTRY: Record<OmniboxTabView, OmniboxTabRenderer> = {
  BOOKMARKS: (props) => (
    <OmniboxBookmarkTab
      keyword={props.keyword}
      showConnectionsOverview={props.openContext === 'dashboard' && props.activeTab.showDashboardConnections}
      onOpenProtocolTab={props.onOpenProtocolTab}
      onOpenLocalTerminal={props.onOpenLocalTerminal}
      closePopover={props.closePopover}
    />
  ),
  QUICK_COMMANDS: (props) => <OmniboxQuickCommandsTab keyword={props.keyword} />,
};
