import type { MessageAttachment, SendOptions } from "@/lib/integrations/types";

/**
 * حمولة رسالة WhatsApp Cloud API (نفس الشكل لـ Meta مباشرة ولـ 360dialog الذي يمرّرها كما هي):
 * قالب معتمد، أو زر رابط، أو وسائط، أو نص. رابط ووسائط نوعا رسالة مختلفان — لا يجتمعان في رسالة واحدة.
 */
export function buildWhatsAppPayload(to: string, body: string, attachment?: MessageAttachment, options?: SendOptions): Record<string, unknown> {
  if (options?.template) {
    const params = options.template.bodyParams ?? [];
    return {
      messaging_product: "whatsapp", recipient_type: "individual", to, type: "template",
      template: {
        name: options.template.name,
        language: { code: options.template.language },
        ...(params.length ? { components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }] } : {}),
      },
    };
  }
  if (attachment?.kind === "link") {
    return {
      messaging_product: "whatsapp", recipient_type: "individual", to, type: "interactive",
      interactive: { type: "cta_url", body: { text: body }, action: { name: "cta_url", parameters: { display_text: attachment.text.slice(0, 20), url: attachment.url } } },
    };
  }
  if (attachment?.kind === "media") {
    return {
      messaging_product: "whatsapp", recipient_type: "individual", to, type: attachment.mediaType,
      [attachment.mediaType]: { link: attachment.url, caption: body || undefined, filename: attachment.mediaType === "document" ? attachment.filename : undefined },
    };
  }
  return { messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { body } };
}
