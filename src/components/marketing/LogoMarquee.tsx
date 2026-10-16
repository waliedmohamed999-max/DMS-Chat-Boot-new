"use client";

import { useState } from "react";
import { ArrowUpLeft } from "lucide-react";

const COMPANY_PROJECTS = [
  { name: "متجر شلفا", imageUrl: "/company-clients/shalfa.webp", href: "https://dmstech.sa/clients/shalfa", sector: "شماغ" },
  { name: "متجر مهمار", imageUrl: "/company-clients/mihmar.webp", href: "https://dmstech.sa/clients/mihmar", sector: "عسل" },
  { name: "سوق الزل", imageUrl: "/company-clients/souq-alzel.webp", href: "https://dmstech.sa/clients/souq-alzel", sector: "تجارة إلكترونية" },
  { name: "بهارات خنينة", imageUrl: "/company-clients/khanenh.webp", href: "https://dmstech.sa/clients/khanenh", sector: "منتجات غذائية" },
  { name: "أنا طبيعي", imageUrl: "/company-clients/ana-tabiei.webp", href: "https://dmstech.sa/clients/ana-tabiei", sector: "متجر إلكتروني" },
  { name: "متجر فور ماس", imageUrl: "/company-clients/4mass.webp", href: "https://dmstech.sa/clients/4mass", sector: "تجارة إلكترونية" },
];
type ClientLogo = { name: string; imageUrl?: string; href?: string; sector?: string };

function ClientCard({ client }: { client: ClientLogo }) {
  const [failed, setFailed] = useState(false);
  const figure = <figure className="client-visual-card"><div className="client-visual-image">
    {!failed ? <img src={client.imageUrl} alt={client.name} width={640} height={480} loading="lazy" onError={() => setFailed(true)} /> : <div className="dms-project-unavailable">{client.name}</div>}
    </div><figcaption><span><strong>{client.name}</strong>{client.sector && <small>{client.sector}</small>}</span>{client.href && <ArrowUpLeft size={18} aria-hidden="true" />}</figcaption></figure>;
  return client.href ? <a href={client.href} className="dms-project-link" aria-label={`تفاصيل مشروع ${client.name}`}>{figure}</a> : figure;
}

export function LogoMarquee({ clients = [] }: { clients?: ClientLogo[] }) {
  const actualClients = clients.filter(client => client.imageUrl);
  const displayed = actualClients.length ? actualClients : COMPANY_PROJECTS;
  return <div className="mx-auto max-w-6xl px-4"><div className="clients-visual-grid">{displayed.map((client, i) => <ClientCard key={`${client.name}-${i}`} client={client} />)}</div></div>;
}
