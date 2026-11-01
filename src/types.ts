export interface ThemeConfig {
  bg: string;
  card: string;
  line: string;
  text: string;
  mute: string;
  accent1: string;
  accent2: string;
  gold: string;
}

export interface LinkItem {
  title: string;
  url: string;
  button: string;
}

export interface TabConfig {
  label: string;
  icon: string;
  type: "videos" | "links" | "page";
  title?: string;
  items?: LinkItem[];
  text?: string;
}

export interface AdConfig {
  provider: "demo" | "adsgram";
  demoSeconds: number;
  blockId: string;
  lockedLabel: string;
  unlockTitle: string;
  unlockText: string;
  watchButton: string;
  cancelButton: string;
  unlockDuration?: "session" | "forever";
}

export interface VideoItem {
  id: string;
  title: string;
  cat: string;
  dur: string;
  views: number;
  likes: number;
  ads: number;
  src: string;
  thumb: string;
}

export interface AppConfig {
  appName: string;
  logo: string;
  premiumLabel: string;
  notice: string;
  searchPlaceholder: string;
  emptyText: string;
  theme: ThemeConfig;
  tabs: TabConfig[];
  categories: string[];
  ads: AdConfig;
  videos: VideoItem[];
}
