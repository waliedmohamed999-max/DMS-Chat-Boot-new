import { Megaphone, Bot, MessagesSquare, Network, BadgeCheck, Mail, Phone, Clock3, CircleCheck, Copy, Store, Users, Inbox, FileText, QrCode, Building2, GraduationCap, Plane, HeartPulse, ShoppingCart, Coffee, TrendingUp, Target, Headset, MessageCircle, type LucideIcon } from "lucide-react";

type IconProps = { className?: string };

// Matches the Lucide stroke and geometry used by dmstech.sa.
function brandIcon(Icon: LucideIcon) {
  return function BrandIcon({ className }: IconProps) {
    return <Icon className={className} strokeWidth={1.75} aria-hidden="true" />;
  };
}

export const CampaignIcon = brandIcon(Megaphone);
export const ChatbotIcon = brandIcon(Bot);
export const CrmIcon = brandIcon(MessagesSquare);
export const IntegrationIcon = brandIcon(Network);
export const VerifiedBadgeIcon = brandIcon(BadgeCheck);
export const MailIcon = brandIcon(Mail);
export const PhoneIcon = brandIcon(Phone);
export const ClockIcon = brandIcon(Clock3);
export const CheckCircleIcon = brandIcon(CircleCheck);
export const CopyIcon = brandIcon(Copy);
export const StorefrontIcon = brandIcon(Store);
export const CustomerIcon = brandIcon(Users);
export const InboxIcon = brandIcon(Inbox);
export const TemplateIcon = brandIcon(FileText);
export const QrCodeIcon = brandIcon(QrCode);
export const BuildingIcon = brandIcon(Building2);
export const GraduationCapIcon = brandIcon(GraduationCap);
export const PlaneIcon = brandIcon(Plane);
export const HeartPulseIcon = brandIcon(HeartPulse);
export const ShoppingCartIcon = brandIcon(ShoppingCart);
export const CoffeeCupIcon = brandIcon(Coffee);
export const TrendUpIcon = brandIcon(TrendingUp);
export const TargetIcon = brandIcon(Target);
export const HeadsetIcon = brandIcon(Headset);
export const WhatsAppMessageIcon = brandIcon(MessageCircle);
