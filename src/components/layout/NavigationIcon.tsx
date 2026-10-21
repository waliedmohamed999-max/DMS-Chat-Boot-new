import {
  LayoutDashboard, BellRing, Bot, MessagesSquare, MessageCircle, UsersRound,
  Megaphone, FileText, Plug, Package, CreditCard, Settings2, ShieldCheck,
  Store, Mail, Activity, Layers3, Phone, Wallet, Tags, ArrowLeftRight,
  Radio, Cable, Globe2, Handshake, ScrollText, PenLine, Ellipsis, BrainCircuit, ReceiptText,
} from "lucide-react";

const ICONS = {
  dashboard: LayoutDashboard, admin: LayoutDashboard, chatbot: BellRing,
  "ai-agent": Bot, brain: BrainCircuit, "website-chat": MessageCircle, inbox: MessagesSquare,
  contacts: UsersRound, campaigns: Megaphone, templates: FileText,
  integrations: Plug, orders: Package, billing: CreditCard, settings: Settings2,
  approvals: ShieldCheck, tenants: Store, leads: Mail, chats: MessagesSquare,
  health: Activity, plans: Layers3, numbers: Phone, wallets: Wallet,
  messaging: Tags, migration: ArrowLeftRight, monitoring: Radio, setup: Cable,
  salla: Store, zid: Store, zatca: ReceiptText, countries: Globe2, affiliates: Handshake,
  announcements: Megaphone, team: UsersRound, "audit-log": ScrollText, content: PenLine,
};

export function NavigationIcon({ href, className = "h-[18px] w-[18px]" }: { href: string; className?: string }) {
  const key = href.split("/").filter(Boolean).at(-1) as keyof typeof ICONS;
  const Icon = ICONS[key] ?? Ellipsis;
  return <Icon className={className} strokeWidth={1.7} aria-hidden="true" />;
}

export function isNavigationActive(pathname: string | null, href: string) {
  return pathname === href || (href !== "/dashboard" && href !== "/admin" && Boolean(pathname?.startsWith(href + "/")));
}
